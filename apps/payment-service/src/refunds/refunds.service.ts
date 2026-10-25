import { randomUUID } from "crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  EXCHANGES,
  RefundInfoRequestedPayload,
  RefundReasonCategory,
  RefundRejectedPayload,
  ROUTING_KEYS,
} from "@booking-ticket-system/event-contracts";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { PaymentStatus, Prisma, Refund, RefundStatus } from "../generated/prisma";
import { Actor } from "../auth/current-actor.decorator";
import { Role } from "../auth/role";
import { BookingServiceClient, OrderView } from "../booking-client/booking-service.client";
import { EventServiceClient } from "../event-client/event-service.client";
import { PrismaService } from "../prisma/prisma.service";
import { RabbitMqService } from "../rabbitmq/rabbitmq.service";
import { TicketServiceClient } from "../ticket-client/ticket-service.client";
import { ApproveRefundDto } from "./dto/review-refund.dto";
import { ListMyRefundsDto, ListRefundsDto } from "./dto/list-refunds.dto";
import { RequestRefundDto } from "./dto/request-refund.dto";
import { EvidenceStorageService, UploadedEvidenceFile } from "./evidence/evidence-storage.service";
import { refundActivity } from "./refund-activity";
import { RefundProcessorService } from "./refund-processor.service";
import { amountForPercent, grossForItems, quoteRefund } from "./refund-policy";

/** Organizer must decide within this, else the customer may escalate to admin (Eventbrite's 5 business days ≈ 7 calendar days). */
const REVIEW_SLA_MS = 7 * 24 * 3_600_000;
/** How long after a rejection the customer may still escalate. */
const ESCALATION_WINDOW_MS = 7 * 24 * 3_600_000;

const OPEN_STATUSES: RefundStatus[] = [
  RefundStatus.REQUESTED,
  RefundStatus.NEED_INFO,
  RefundStatus.ESCALATED,
  RefundStatus.APPROVED,
  RefundStatus.PROCESSING,
  RefundStatus.FAILED,
];
/** Statuses in which ticket-service holds the order's tickets in REFUND_PENDING. */
const LOCKING_STATUSES: RefundStatus[] = [RefundStatus.REQUESTED, RefundStatus.NEED_INFO, RefundStatus.ESCALATED];

const DETAIL_INCLUDE = {
  evidence: { orderBy: { createdAt: "asc" } },
  auditLogs: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.RefundInclude;

/**
 * UC-04 (docs/spec/02-use-cases.md), redesigned in
 * docs/spec/13-refund-and-anti-fraud-design.md §2:
 *  - the policy decides the amount up front (quote), shown before submit;
 *  - the order's tickets are locked (REFUND_PENDING, unscannable) for as
 *    long as the request is open, so nobody gets in AND gets paid;
 *  - only the event's own organizer (or an admin) reviews it — before, any
 *    organizer could approve a refund on any other organizer's event;
 *  - a rejected/ignored request can be escalated once to an admin;
 *  - money moves only in RefundProcessorService (idempotent, retried).
 */
@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
    private readonly booking: BookingServiceClient,
    private readonly events: EventServiceClient,
    private readonly tickets: TicketServiceClient,
    private readonly rabbit: RabbitMqService,
    private readonly storage: EvidenceStorageService,
    private readonly processor: RefundProcessorService,
  ) {}

  /** What the customer would get back if they asked now (for these tickets) — no side effects. */
  async quote(actor: Actor, orderId: string, category?: RefundReasonCategory, orderItemIds?: string[]) {
    const { quote, orderItemIds: selected } = await this.prepare(actor, orderId, category, orderItemIds);
    return { ...quote, orderItemIds: selected };
  }

  async request(actor: Actor, dto: RequestRefundDto, files: UploadedEvidenceFile[]) {
    const { order, payment, quote, orderItemIds } = await this.prepare(actor, dto.orderId, dto.reasonCategory, dto.orderItemIds);
    if (!quote.eligible) {
      throw new BadRequestException(quote.message);
    }
    if (quote.evidenceRequired && files.length === 0) {
      throw new BadRequestException("Lý do này cần kèm ít nhất một tệp minh chứng");
    }
    this.storage.validate(files);

    // Lock BEFORE the row exists: if a ticket was already scanned at the
    // gate, the customer hears "no" now instead of a reviewer approving a
    // refund for a ticket that was used.
    const refundId = randomUUID();
    await this.tickets.lock(orderItemIds, refundId);

    try {
      const now = new Date();
      await this.prisma.refund.create({
        data: {
          id: refundId,
          paymentId: payment.id,
          orderId: order.id,
          eventId: order.eventId,
          userId: actor.userId!,
          kind: quote.kind,
          reasonCategory: dto.reasonCategory,
          reason: dto.reason,
          orderItemIds,
          grossAmount: quote.grossAmount,
          refundPercent: quote.percent,
          amount: quote.amount,
          feeAmount: quote.feeAmount,
          status: quote.autoApprove ? RefundStatus.APPROVED : RefundStatus.REQUESTED,
          requestedBy: actor.userId!,
          slaDueAt: quote.autoApprove ? null : new Date(now.getTime() + REVIEW_SLA_MS),
          ...(quote.autoApprove ? { decidedBy: "system", decidedAt: now } : {}),
        },
      });
      await this.audit(refundId, actor.userId!, "REQUEST", null, RefundStatus.REQUESTED, dto.reason);
      await this.saveEvidence(refundId, actor.userId!, files);
    } catch (err) {
      await this.tickets.unlock(refundId).catch(() => undefined);
      throw err;
    }

    if (quote.autoApprove) {
      const note = quote.kind === "EVENT_POSTPONED" ? "Hoàn 100% do sự kiện dời lịch" : "Tự động duyệt theo chính sách hoàn vé của sự kiện";
      await this.audit(refundId, "system", "APPROVE", RefundStatus.REQUESTED, RefundStatus.APPROVED, note);
      await this.processor.process(refundId); // FAILED is fine here — the cron retries it
    }
    return this.findOne(refundId);
  }

  async listMine(actor: Actor, query: ListMyRefundsDto) {
    return this.prisma.refund.findMany({
      where: { OR: [{ requestedBy: actor.userId! }, { userId: actor.userId! }], ...(query.orderId ? { orderId: query.orderId } : {}) },
      include: DETAIL_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
  }

  async list(actor: Actor, query: ListRefundsDto) {
    if (actor.role !== Role.ADMIN) {
      if (!query.eventId) {
        throw new BadRequestException("eventId is required");
      }
      await this.assertOwnsEvent(query.eventId, actor);
    }
    const where: Prisma.RefundWhereInput = {
      ...(query.eventId ? { eventId: query.eventId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [data, total] = await Promise.all([
      this.prisma.refund.findMany({ where, include: DETAIL_INCLUDE, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      this.prisma.refund.count({ where }),
    ]);
    return { data, page, limit, total };
  }

  async get(refundId: string, actor: Actor) {
    const refund = await this.findOne(refundId);
    await this.assertCanView(refund, actor);
    return refund;
  }

  async openEvidence(refundId: string, evidenceId: string, actor: Actor) {
    const refund = await this.findOne(refundId);
    await this.assertCanView(refund, actor);
    const evidence = refund.evidence.find((e) => e.id === evidenceId);
    if (!evidence) {
      throw new NotFoundException("Evidence not found");
    }
    return { evidence, stream: await this.storage.open(evidence.storageKey) };
  }

  // ---- reviewer actions (event's organizer, or admin) ----

  async approve(refundId: string, actor: Actor, dto: ApproveRefundDto) {
    const refund = await this.findOne(refundId);
    await this.assertCanReview(refund, actor);

    const percent = dto.percent ?? refund.refundPercent;
    if (percent < refund.refundPercent) {
      throw new BadRequestException(`Không được hoàn thấp hơn mức chính sách (${refund.refundPercent}%)`);
    }
    const gross = Number(refund.grossAmount ?? refund.amount);
    const { amount, feeAmount } = amountForPercent(gross, percent);

    // Re-assert the lock (idempotent for this refundId): if anything left the
    // tickets unlocked and one got scanned since, refuse to pay out.
    if (refund.orderItemIds.length > 0) {
      await this.tickets.lock(refund.orderItemIds, refund.id);
    }

    await this.transition(refund, this.reviewableFrom(actor), RefundStatus.APPROVED, actor, "APPROVE", dto.note ?? null, {
      refundPercent: percent,
      amount,
      feeAmount,
      decidedBy: actor.userId!,
      decidedAt: new Date(),
    });
    await this.processor.process(refund.id);
    return this.findOne(refund.id);
  }

  async reject(refundId: string, actor: Actor, reason: string) {
    const refund = await this.findOne(refundId);
    await this.assertCanReview(refund, actor);
    const final = refund.status === RefundStatus.ESCALATED;

    // Unlock first: if this fails nothing changed and the reviewer retries;
    // the reverse order could leave a rejected customer locked out of the venue.
    await this.tickets.unlock(refund.id);
    await this.transition(
      refund,
      this.reviewableFrom(actor),
      final ? RefundStatus.REJECTED_FINAL : RefundStatus.REJECTED,
      actor,
      "REJECT",
      reason,
      { rejectReason: reason, decidedBy: actor.userId!, decidedAt: new Date() },
    );

    const payload: RefundRejectedPayload = { refundId: refund.id, orderId: refund.orderId, userId: refund.userId ?? refund.requestedBy, reason, final };
    await this.rabbit.publish(EXCHANGES.PAYMENT, ROUTING_KEYS.REFUND_REJECTED, payload);
    return this.findOne(refund.id);
  }

  async requestInfo(refundId: string, actor: Actor, message: string) {
    const refund = await this.findOne(refundId);
    await this.assertCanReview(refund, actor);
    await this.transition(refund, [RefundStatus.REQUESTED, RefundStatus.ESCALATED], RefundStatus.NEED_INFO, actor, "NEED_INFO", message, {
      infoRequest: message,
    });
    const payload: RefundInfoRequestedPayload = { refundId: refund.id, orderId: refund.orderId, userId: refund.userId ?? refund.requestedBy, message };
    await this.rabbit.publish(EXCHANGES.PAYMENT, ROUTING_KEYS.REFUND_INFO_REQUESTED, payload);
    return this.findOne(refund.id);
  }

  /** Admin recovery for a FAILED refund that ran out of automatic retries, or one stuck PROCESSING after the admin checked the gateway. */
  async retry(refundId: string, actor: Actor) {
    const refund = await this.findOne(refundId);
    await this.transition(refund, [RefundStatus.FAILED, RefundStatus.PROCESSING], RefundStatus.APPROVED, actor, "RETRY", null, { attempts: 0 });
    await this.processor.process(refund.id);
    return this.findOne(refund.id);
  }

  // ---- customer actions ----

  /** Answer a NEED_INFO (or add proof to an open request): optional note + more files, back to the reviewer's queue. */
  async respond(refundId: string, actor: Actor, message: string | undefined, files: UploadedEvidenceFile[]) {
    const refund = await this.findOwned(refundId, actor);
    if (refund.status !== RefundStatus.NEED_INFO && refund.status !== RefundStatus.REQUESTED && refund.status !== RefundStatus.ESCALATED) {
      throw new BadRequestException(`Không thể bổ sung cho yêu cầu ở trạng thái ${refund.status}`);
    }
    if (!message && files.length === 0) {
      throw new BadRequestException("Cần nội dung phản hồi hoặc tệp minh chứng");
    }
    if (refund.evidence.length + files.length > 10) {
      throw new BadRequestException("Mỗi yêu cầu tối đa 10 tệp minh chứng");
    }
    this.storage.validate(files);
    await this.saveEvidence(refund.id, actor.userId!, files);
    if (refund.status === RefundStatus.NEED_INFO) {
      // Back to whoever asked: an admin's question on an escalated request returns to the admin queue.
      const backTo = refund.escalatedAt ? RefundStatus.ESCALATED : RefundStatus.REQUESTED;
      await this.transition(refund, [RefundStatus.NEED_INFO], backTo, actor, "RESPOND", message ?? null, { infoRequest: null });
    } else {
      await this.audit(refund.id, actor.userId!, "RESPOND", refund.status, refund.status, message ?? `+${files.length} tệp`);
    }
    return this.findOne(refund.id);
  }

  async withdraw(refundId: string, actor: Actor) {
    const refund = await this.findOwned(refundId, actor);
    if (!LOCKING_STATUSES.includes(refund.status)) {
      throw new BadRequestException(`Không thể rút yêu cầu ở trạng thái ${refund.status}`);
    }
    await this.tickets.unlock(refund.id);
    await this.transition(refund, LOCKING_STATUSES, RefundStatus.WITHDRAWN, actor, "WITHDRAW", null, {});
    return this.findOne(refund.id);
  }

  /**
   * One appeal to an admin: after a rejection (within ESCALATION_WINDOW_MS)
   * or when the organizer sat on it past slaDueAt — Eventbrite's escalation.
   */
  async escalate(refundId: string, actor: Actor, message: string) {
    const refund = await this.findOwned(refundId, actor);
    const now = Date.now();
    const rejectedRecently = refund.status === RefundStatus.REJECTED && !!refund.decidedAt && now - refund.decidedAt.getTime() <= ESCALATION_WINDOW_MS;
    const overdue =
      (refund.status === RefundStatus.REQUESTED || refund.status === RefundStatus.NEED_INFO) && !!refund.slaDueAt && now > refund.slaDueAt.getTime();
    if (refund.escalatedAt || (!rejectedRecently && !overdue)) {
      throw new BadRequestException("Yêu cầu này chưa thể (hoặc không còn) khiếu nại lên quản trị viên");
    }
    if (refund.status === RefundStatus.REJECTED) {
      await this.tickets.lock(refund.orderItemIds, refund.id); // rejection unlocked them — fails if one was used since
    }
    await this.transition(refund, [refund.status], RefundStatus.ESCALATED, actor, "ESCALATE", message, { escalatedAt: new Date() });
    return this.findOne(refund.id);
  }

  // ---- system ----

  /**
   * docs/spec/13 §2.3 — 100% refund for every paid order of a canceled
   * event, no request needed. Created APPROVED; RefundProcessorService's
   * cron pays them out in batches. An order's open customer request is
   * superseded (WITHDRAWN) by this one; an order already being or having
   * been refunded is left alone.
   */
  async refundCanceledEvent(eventId: string, reason: string): Promise<number> {
    const orders = await this.booking.listPaidForEvent(eventId);
    let created = 0;
    for (const order of orders) {
      const existing = await this.prisma.refund.findMany({ where: { orderId: order.id, status: { in: [...OPEN_STATUSES, RefundStatus.COMPLETED] } } });
      // Approved/paid refunds stand; open customer requests are superseded by the 100% refund.
      const settled = existing.filter((r) => !LOCKING_STATUSES.includes(r.status));
      if (settled.some((r) => r.orderItemIds.length === 0)) continue; // the whole order is already being/been refunded
      const settledItems = new Set(settled.flatMap((r) => r.orderItemIds));
      const remainingIds = order.items.map((i) => i.id).filter((id) => !settledItems.has(id));
      if (settled.length > 0 && remainingIds.length === 0) continue;
      for (const open of existing.filter((r) => LOCKING_STATUSES.includes(r.status))) {
        await this.transition(open, LOCKING_STATUSES, RefundStatus.WITHDRAWN, { userId: "system" }, "SUPERSEDE", "Sự kiện bị hủy — thay bằng hoàn 100%", {});
      }

      const payment = await this.prisma.payment.findFirst({
        where: { orderId: order.id, status: PaymentStatus.SUCCEEDED },
        orderBy: { createdAt: "desc" },
      });
      if (!payment) {
        this.logger.error(`Event ${eventId} canceled: paid order ${order.id} has no SUCCEEDED payment here — needs manual follow-up`);
        continue;
      }
      // Tickets already refunded on their own keep that refund; this pays back the rest of what was paid.
      const settledGross = settled.reduce((sum, r) => sum + Number(r.grossAmount ?? r.amount), 0);
      const gross = Math.max(0, Number(payment.amount) - settledGross);
      const refund = await this.prisma.refund.create({
        data: {
          paymentId: payment.id,
          orderId: order.id,
          eventId,
          userId: order.userId,
          kind: "EVENT_CANCELED",
          reason,
          orderItemIds: settled.length > 0 ? remainingIds : [],
          grossAmount: gross,
          refundPercent: 100,
          amount: gross,
          feeAmount: 0,
          status: RefundStatus.APPROVED,
          requestedBy: "system",
          decidedBy: "system",
          decidedAt: new Date(),
        },
      });
      await this.audit(refund.id, "system", "APPROVE", null, RefundStatus.APPROVED, `Sự kiện bị hủy: ${reason}`);
      created++;
    }
    return created;
  }

  // ---- helpers ----

  /**
   * Order ownership (via booking's own owner-checked read), its latest
   * successful payment, which tickets the request covers, and the policy
   * quote for exactly those tickets.
   *
   * Per ticket: an order can have several refunds, each claiming its own
   * order items (Refund.orderItemIds; an empty list on an older/system row
   * means the whole order). A ticket claimed by an open or completed refund
   * can't be asked for again; a rejected/withdrawn one released its claim.
   */
  private async prepare(actor: Actor, orderId: string, category?: RefundReasonCategory, requestedItemIds?: string[]) {
    const order = await this.booking.getOrder(orderId, actor.userId!, actor.role!);
    if (order.status !== "TICKET_ISSUED" || !order.eventId) {
      throw new BadRequestException("Chỉ có thể yêu cầu hoàn cho đơn đã phát hành vé");
    }
    const eventId = order.eventId;
    const payment = await this.prisma.payment.findFirst({
      where: { orderId: order.id, status: PaymentStatus.SUCCEEDED },
      orderBy: { createdAt: "desc" },
    });
    if (!payment) {
      throw new BadRequestException("No successful payment found for this order");
    }
    const claims = await this.prisma.refund.findMany({ where: { orderId: order.id, status: { in: [...OPEN_STATUSES, RefundStatus.COMPLETED] } } });
    const wholeOrder = claims.find((r) => r.orderItemIds.length === 0);
    if (wholeOrder) {
      throw new ConflictException(wholeOrder.status === RefundStatus.COMPLETED ? "Đơn hàng đã được hoàn tiền" : "Đơn hàng đang có yêu cầu hoàn chưa xử lý xong");
    }
    const claimed = new Set(claims.flatMap((r) => r.orderItemIds));
    const remainingIds = order.items.map((i) => i.id).filter((id) => !claimed.has(id));
    if (remainingIds.length === 0) {
      throw new ConflictException("Tất cả vé của đơn đã được hoàn hoặc đang chờ hoàn");
    }

    const orderItemIds = requestedItemIds?.length ? [...new Set(requestedItemIds)] : remainingIds;
    for (const id of orderItemIds) {
      if (!order.items.some((i) => i.id === id)) {
        throw new BadRequestException("Vé không thuộc đơn hàng này");
      }
      if (claimed.has(id)) {
        throw new ConflictException("Có vé đã được hoàn hoặc đang chờ hoàn — tải lại để xem trạng thái mới");
      }
    }

    const claimedGross = claims.reduce((sum, r) => sum + Number(r.grossAmount ?? r.amount), 0);
    const gross = grossForItems(order.items, orderItemIds, remainingIds, Number(payment.amount), claimedGross);
    const event = await this.events.getRefundContext(eventId);
    const quote = quoteRefund(event, gross, new Date(), category);
    return { order: order as OrderView, payment, quote, orderItemIds };
  }

  /** Organizers act on their queue; ESCALATED is the admin's. */
  private reviewableFrom(actor: Actor): RefundStatus[] {
    return actor.role === Role.ADMIN
      ? [RefundStatus.REQUESTED, RefundStatus.NEED_INFO, RefundStatus.ESCALATED]
      : [RefundStatus.REQUESTED, RefundStatus.NEED_INFO];
  }

  private async assertCanReview(refund: Refund, actor: Actor) {
    if (!this.reviewableFrom(actor).includes(refund.status)) {
      throw new BadRequestException(
        refund.status === RefundStatus.ESCALATED ? "Yêu cầu đã được khiếu nại lên quản trị viên" : `Yêu cầu đang ở trạng thái ${refund.status}`,
      );
    }
    if (actor.role === Role.ADMIN) return;
    if (!refund.eventId) {
      throw new ForbiddenException("Only an admin can review this refund");
    }
    await this.assertOwnsEvent(refund.eventId, actor);
  }

  private async assertCanView(refund: Refund, actor: Actor) {
    if (actor.role === Role.ADMIN) return;
    if (refund.requestedBy === actor.userId || refund.userId === actor.userId) return;
    if (actor.role === Role.ORGANIZER && refund.eventId) {
      await this.assertOwnsEvent(refund.eventId, actor);
      return;
    }
    throw new ForbiddenException("You cannot view this refund");
  }

  private async assertOwnsEvent(eventId: string, actor: Actor) {
    const event = await this.events.getRefundContext(eventId);
    if (event.organizerId !== actor.userId) {
      throw new ForbiddenException("You do not own this event");
    }
  }

  private async findOwned(refundId: string, actor: Actor) {
    const refund = await this.findOne(refundId);
    if (refund.requestedBy !== actor.userId) {
      throw new ForbiddenException("You do not own this refund");
    }
    return refund;
  }

  private async findOne(refundId: string) {
    const refund = await this.prisma.refund.findUnique({ where: { id: refundId }, include: DETAIL_INCLUDE });
    if (!refund) {
      throw new NotFoundException("Refund not found");
    }
    return refund;
  }

  /** Conditional state change + audit row — concurrent reviewers can't both act on the same request. */
  private async transition(
    refund: Refund,
    from: RefundStatus[],
    to: RefundStatus,
    actor: Pick<Actor, "userId">,
    action: string,
    note: string | null,
    data: Prisma.RefundUpdateManyMutationInput,
  ) {
    const { count } = await this.prisma.refund.updateMany({ where: { id: refund.id, status: { in: from } }, data: { ...data, status: to } });
    if (count === 0) {
      throw new ConflictException("Yêu cầu vừa được người khác xử lý — tải lại để xem trạng thái mới");
    }
    await this.audit(refund.id, actor.userId ?? "system", action, refund.status, to, note);
  }

  private async audit(refundId: string, actorId: string, action: string, fromStatus: string | null, toStatus: string | null, note: string | null) {
    const row = await this.prisma.refundAuditLog.create({ data: { refundId, actorId, action, fromStatus, toStatus, note } });
    const refund = await this.prisma.refund.findUnique({ where: { id: refundId } });
    if (refund) {
      await this.activity.record(refundActivity(refund, actorId, action, note));
    }
    return row;
  }

  private async saveEvidence(refundId: string, uploadedBy: string, files: UploadedEvidenceFile[]) {
    for (const file of files) {
      const id = randomUUID();
      const stored = await this.storage.put(refundId, id, file);
      await this.prisma.refundEvidence.create({ data: { id, refundId, uploadedBy, ...stored } });
    }
  }
}
