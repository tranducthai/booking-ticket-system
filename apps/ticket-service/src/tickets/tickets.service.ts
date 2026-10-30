import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { Ticket, TicketStatus } from "../generated/prisma";
import { Actor } from "../auth/current-actor.decorator";
import { Role } from "../auth/role";
import { EventServiceClient } from "../event-client/event-service.client";
import { MetricsService } from "../metrics/metrics.service";
import { PrismaService } from "../prisma/prisma.service";
import { UserServiceClient } from "../user-client/user-service.client";
import { QrSignerService } from "../qr/qr-signer.service";
import { ListMineDto } from "./dto/list-mine.dto";

export const EVENT_CANCELED_REASON = "EVENT_CANCELED";

/**
 * A ticket as any LIST endpoint returns it: never the QR. Lesson from
 * Ticketbox's Dec-2024 incident (docs/spec/13-refund-and-anti-fraud-design.md
 * §3.4) — a list/caching bug must leak at most metadata, not scannable codes.
 * The QR only comes back from the owner-checked single-ticket read.
 */
function withoutQr(ticket: Ticket) {
  const { qrPayload: _qr, qrSignature: _sig, ...rest } = ticket;
  return rest;
}

const CHECKIN_REJECTION: Record<string, { reason: string; message: string; status: "bad" | "conflict" }> = {
  [TicketStatus.USED]: { reason: "already_used", message: "Vé này đã được check-in", status: "conflict" },
  [TicketStatus.CANCELED]: { reason: "canceled", message: "Vé này đã bị hủy", status: "bad" },
  [TicketStatus.REFUND_PENDING]: {
    reason: "refund_pending",
    message: "Vé đang chờ hoàn tiền — khách cần rút yêu cầu hoàn trước khi vào cổng",
    status: "bad",
  },
  [TicketStatus.RESALE_LISTED]: {
    reason: "resale_listed",
    message: "Vé đang được rao bán lại — chủ vé cần huỷ tin bán trước khi vào cổng",
    status: "bad",
  },
};

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
    private readonly qrSigner: QrSignerService,
    private readonly eventClient: EventServiceClient,
    private readonly metrics: MetricsService,
    private readonly userClient: UserServiceClient,
  ) {}

  async listMine(userId: string, query: ListMineDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = { userId, ...(query.eventId ? { eventId: query.eventId } : {}) };
    const [data, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.ticket.count({ where }),
    ]);
    return { data: data.map(withoutQr), page, limit, total };
  }

  /**
   * The holder's ticket page. For an online event a valid (or already used)
   * ticket also carries the join link — the one place it's ever shown to a
   * customer; a canceled/refunded ticket doesn't get it.
   */
  async findOwned(ticketId: string, userId: string) {
    const ticket = await this.getOwned(ticketId, userId);
    const view = this.ownerView(ticket);
    if (ticket.status !== TicketStatus.ISSUED && ticket.status !== TicketStatus.USED) return { ...view, onlineUrl: null };
    const access = await this.eventClient.getOnlineAccess(ticket.eventId).catch(() => null);
    return { ...view, onlineUrl: access?.onlineUrl ?? null };
  }

  /**
   * The holder suspects their QR leaked (shared a screenshot, lost a
   * printout): bump qrVersion, which kills the old static QR AND every
   * rotating code derived from the old seed, and re-sign.
   */
  async reissueOwn(ticketId: string, userId: string) {
    const ticket = await this.getOwned(ticketId, userId);
    if (ticket.status !== TicketStatus.ISSUED) {
      throw new BadRequestException("Chỉ cấp lại mã cho vé còn hiệu lực");
    }
    const reissued = await this.reissue(ticket);
    await this.activity.record({
      action: "ticket.qr_reissued",
      targetType: "ticket",
      targetId: ticket.id,
      eventId: ticket.eventId,
      subjectUserId: ticket.userId,
      summary: `Cấp lại mã QR vé #${ticket.id.slice(0, 8)} (v${reissued.qrVersion}) — mã cũ hết hiệu lực`,
    });
    return this.ownerView(reissued);
  }

  /** Incident response (e.g. a QR leak like Ticketbox Dec-2024): reissue every live ticket of an event at once. */
  async reissueForEvent(eventId: string) {
    const tickets = await this.prisma.ticket.findMany({ where: { eventId, status: TicketStatus.ISSUED } });
    for (const ticket of tickets) {
      await this.reissue(ticket);
    }
    await this.activity.record({
      action: "ticket.qr_bulk_reissued",
      targetType: "event",
      targetId: eventId,
      eventId,
      summary: `Cấp lại hàng loạt mã QR cho ${tickets.length} vé`,
      metadata: { count: tickets.length },
    });
    return { eventId, reissued: tickets.length };
  }

  signingKeys() {
    return this.qrSigner.signingKeys();
  }

  /**
   * UC-02 (docs/spec/02-use-cases.md), hardened per
   * docs/spec/13-refund-and-anti-fraud-design.md §3.3:
   *  1. the scanning account must own the event it is scanning for;
   *  2. the code must verify (signature, offline-safe) and carry the holder's CCCD;
   *  3. the ticket must belong to THIS event and carry the current qrVersion;
   *  4. ISSUED -> USED is ONE conditional UPDATE, so two gates scanning the
   *     same screenshot in the same millisecond can't both succeed — the
   *     old read-then-write let both through.
   */
  async checkIn(eventId: string, code: string, actor: Actor) {
    await this.assertCanManageEvent(eventId, actor);

    const payload = this.qrSigner.parse(code);
    if (!payload) {
      return this.reject({ eventId }, "invalid_signature", "Mã QR không hợp lệ hoặc bị chỉnh sửa");
    }

    const ticket = await this.prisma.ticket.findUnique({ where: { id: payload.ticketId } });
    if (!ticket) {
      return this.reject({ eventId }, "not_found", "Không tìm thấy vé");
    }
    if (ticket.eventId !== eventId || payload.eventId !== eventId) {
      return this.reject({ eventId, ticket }, "wrong_event", "Vé không thuộc sự kiện này");
    }
    // Require the exact stored string — a validly signed code from before a
    // reissue has the right signature but is dead.
    if ((payload.qrVersion ?? 1) !== ticket.qrVersion || code.trim() !== ticket.qrPayload) {
      return this.reject({ eventId, ticket }, "stale_version", "Mã QR này đã bị thay thế bằng mã mới");
    }
    if (!payload.nationalId) {
      return this.reject({ eventId, ticket }, "missing_national_id", "Vé chưa có số CCCD — chủ vé cần cập nhật CCCD trong tài khoản rồi cấp lại mã QR");
    }

    const { count } = await this.prisma.ticket.updateMany({
      where: { id: ticket.id, status: TicketStatus.ISSUED, qrVersion: ticket.qrVersion },
      data: { status: TicketStatus.USED, checkedInAt: new Date(), checkedInBy: actor.userId! },
    });
    if (count === 0) {
      const current = await this.prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
      const rejection = CHECKIN_REJECTION[current.status] ?? { reason: "stale_version", message: "Mã QR này đã bị thay thế bằng mã mới", status: "bad" };
      return this.reject({ eventId, ticket }, rejection.reason, rejection.message, rejection.status);
    }

    this.metrics.checkinsTotal.inc();
    await this.activity.record({
      action: "ticket.checked_in",
      targetType: "ticket",
      targetId: ticket.id,
      eventId,
      subjectUserId: ticket.userId,
      summary: `Check-in vé #${ticket.id.slice(0, 8)}`,
    });
    // The CCCD comes back so the gate can compare it with the visitor's ID card.
    return { ...withoutQr(await this.prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })), nationalId: payload.nationalId };
  }

  async attendees(eventId: string, actor: Actor) {
    await this.assertCanManageEvent(eventId, actor);
    const tickets = await this.prisma.ticket.findMany({ where: { eventId }, orderBy: { createdAt: "asc" } });
    return tickets.map(withoutQr);
  }

  /**
   * System-to-system read for notification-service — which users hold a
   * live ticket for this event. `includeEventCanceled` also counts tickets
   * voided BY the event's cancellation, so the "event canceled" notice still
   * finds its recipients even when ticket-service's EventCanceled consumer
   * ran first.
   */
  async attendeeUserIdsForEvent(eventId: string, includeEventCanceled = false): Promise<string[]> {
    const rows = await this.prisma.ticket.findMany({
      where: {
        eventId,
        OR: [
          { status: { not: TicketStatus.CANCELED } },
          ...(includeEventCanceled ? [{ cancelReason: EVENT_CANCELED_REASON }] : []),
        ],
      },
      select: { userId: true },
      distinct: ["userId"],
    });
    return rows.map((r) => r.userId);
  }

  /**
   * docs/spec/13 §2.2 — called synchronously by payment-service before it
   * records a refund request. All-or-nothing: every ticket of the given
   * order items must be ISSUED (not used, not canceled, not already
   * locked), else nothing is locked. Idempotent for the same refundId.
   */
  async lockForRefund(orderItemIds: string[], refundId: string) {
    return this.prisma.$transaction(async (tx) => {
      const tickets = await tx.ticket.findMany({ where: { orderItemId: { in: orderItemIds } } });
      if (tickets.length === 0) {
        throw new ConflictException("Đơn hàng chưa có vé được phát hành");
      }
      if (tickets.every((t) => t.status === TicketStatus.REFUND_PENDING && t.refundId === refundId)) {
        return { locked: tickets.length };
      }
      const blocking = tickets.find((t) => t.status !== TicketStatus.ISSUED);
      if (blocking) {
        const label: Record<string, string> = {
          [TicketStatus.USED]: "đã được check-in",
          [TicketStatus.CANCELED]: "đã bị hủy",
          [TicketStatus.REFUND_PENDING]: "đang có yêu cầu hoàn khác",
          [TicketStatus.RESALE_LISTED]: "đang được rao bán lại",
        };
        throw new ConflictException(`Không thể hoàn: có vé ${label[blocking.status] ?? blocking.status}`);
      }
      const { count } = await tx.ticket.updateMany({
        where: { orderItemId: { in: orderItemIds }, status: TicketStatus.ISSUED },
        data: { status: TicketStatus.REFUND_PENDING, refundId },
      });
      if (count !== tickets.length) {
        // A check-in landed between the read and the write — abort the whole lock.
        throw new ConflictException("Trạng thái vé vừa thay đổi — thử lại");
      }
      return { locked: count };
    });
  }

  /** Reverse of lockForRefund — on reject/withdraw. Safe to call repeatedly. */
  async unlockForRefund(refundId: string) {
    const { count } = await this.prisma.ticket.updateMany({
      where: { refundId, status: TicketStatus.REFUND_PENDING },
      data: { status: TicketStatus.ISSUED, refundId: null },
    });
    return { unlocked: count };
  }

  // ------------------------------------------------------------- resale (booking-service, internal)

  /** Lock an ISSUED ticket for a resale listing — the caller must own it. Returns what booking-service needs to price the listing. */
  async lockForResale(ticketId: string, userId: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket || ticket.userId !== userId) throw new NotFoundException("Không tìm thấy vé của bạn");
    if (ticket.status === TicketStatus.RESALE_LISTED) return { ticketId, orderItemId: ticket.orderItemId, eventId: ticket.eventId };
    const { count } = await this.prisma.ticket.updateMany({ where: { id: ticketId, status: TicketStatus.ISSUED }, data: { status: TicketStatus.RESALE_LISTED } });
    if (count === 0) {
      const label: Record<string, string> = {
        [TicketStatus.USED]: "đã được check-in",
        [TicketStatus.CANCELED]: "đã bị hủy",
        [TicketStatus.REFUND_PENDING]: "đang có yêu cầu hoàn",
      };
      throw new ConflictException(`Không thể bán lại: vé ${label[ticket.status] ?? ticket.status}`);
    }
    return { ticketId, orderItemId: ticket.orderItemId, eventId: ticket.eventId };
  }

  /** Listing withdrawn / expired unsold — the seller's ticket works again. */
  async unlockFromResale(ticketId: string) {
    const { count } = await this.prisma.ticket.updateMany({ where: { id: ticketId, status: TicketStatus.RESALE_LISTED }, data: { status: TicketStatus.ISSUED } });
    return { unlocked: count };
  }

  /** Sold: the seller's ticket dies (its QR with it); the buyer's new ticket comes from the normal OrderPaid issuing. Idempotent. */
  async transferResold(ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException("Ticket not found");
    if (ticket.status === TicketStatus.CANCELED && ticket.cancelReason === "RESOLD") return { transferred: true };
    if (ticket.status !== TicketStatus.RESALE_LISTED) throw new ConflictException(`Ticket is ${ticket.status}, not listed for resale`);
    await this.prisma.ticket.update({ where: { id: ticketId }, data: { status: TicketStatus.CANCELED, cancelReason: "RESOLD", qrVersion: { increment: 1 } } });
    await this.activity.record({
      action: "ticket.resold",
      targetType: "ticket",
      targetId: ticketId,
      eventId: ticket.eventId,
      subjectUserId: ticket.userId,
      summary: `Vé #${ticketId.slice(0, 8)} đã được bán lại — vé cũ bị vô hiệu`,
    });
    return { transferred: true };
  }

  private async reissue(ticket: Ticket): Promise<Ticket> {
    const qrVersion = ticket.qrVersion + 1;
    // Re-read the CCCD so a holder who added it after buying gets it on the new code; keep the old one if user-service is down.
    const nationalId = (await this.userClient.findNationalId(ticket.userId)) ?? this.qrSigner.parse(ticket.qrPayload)?.nationalId;
    const signed = this.qrSigner.sign({
      ticketId: ticket.id,
      eventId: ticket.eventId,
      orderItemId: ticket.orderItemId,
      issuedAt: new Date().toISOString(),
      qrVersion,
      ...(nationalId ? { nationalId } : {}),
    });
    // Conditional on the version we read, so two concurrent reissues can't both "win".
    const { count } = await this.prisma.ticket.updateMany({
      where: { id: ticket.id, qrVersion: ticket.qrVersion },
      data: { qrVersion, qrPayload: signed.qrPayload, qrSignature: signed.qrSignature },
    });
    if (count === 0) {
      throw new ConflictException("Vé vừa được cấp lại mã — tải lại trang");
    }
    return this.prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
  }

  private async getOwned(ticketId: string, userId: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) {
      throw new NotFoundException("Ticket not found");
    }
    if (ticket.userId !== userId) {
      throw new ForbiddenException("You do not own this ticket");
    }
    return ticket;
  }

  /** Owner's single-ticket read: the static QR (carrying the holder's CCCD) while the ticket is usable. */
  private ownerView(ticket: Ticket) {
    return { ...withoutQr(ticket), qrPayload: ticket.status === TicketStatus.ISSUED ? ticket.qrPayload : null };
  }

  private async assertCanManageEvent(eventId: string, actor: Actor) {
    if (actor.role === Role.ADMIN) return;
    const organizerId = await this.eventClient.getOrganizerId(eventId);
    if (organizerId !== actor.userId) {
      throw new ForbiddenException("You do not own this event");
    }
  }

  /**
   * Every refused scan is an audit row (docs/spec/14-activity-log-design.md §2):
   * a burst of "already_used" on one ticket is exactly what a resold
   * screenshot looks like at the gate.
   */
  private async reject(
    scan: { eventId: string; ticket?: Ticket },
    reason: string,
    message: string,
    status: "bad" | "conflict" = "bad",
  ): Promise<never> {
    this.metrics.checkinRejectedTotal.inc({ reason });
    await this.activity.record({
      action: "ticket.checkin_rejected",
      targetType: "ticket",
      targetId: scan.ticket?.id ?? null,
      eventId: scan.eventId,
      subjectUserId: scan.ticket?.userId ?? null,
      summary: `Từ chối check-in${scan.ticket ? ` vé #${scan.ticket.id.slice(0, 8)}` : ""}: ${message}`,
      metadata: { reason },
    });
    throw status === "conflict" ? new ConflictException(message) : new BadRequestException(message);
  }
}
