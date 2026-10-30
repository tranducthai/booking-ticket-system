import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomInt, randomUUID } from "crypto";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { vnd } from "../activity-log/format";
import { EventServiceClient } from "../event-client/event-service.client";
import { Order, OrderKind, OrderStatus, Prisma, ResaleStatus } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { TicketServiceClient } from "../ticket-client/ticket-service.client";

/** Platform fee on a resale, kept from the seller's payout. */
export const RESALE_FEE_PERCENT = 5;
/** Listings close this long before the event starts — the buyer needs time to receive the new ticket. */
const CLOSE_BEFORE_START_MS = 60 * 60 * 1000;

/**
 * "Bán lại vé" — customer-to-customer resale of issued tickets.
 *
 * list(): ticket-service locks the ticket (RESALE_LISTED) first, then the
 * listing is written; any validation failure unlocks it again.
 * buy(): the listing is claimed (ACTIVE -> RESERVED) atomically together
 * with a RESALE order the buyer pays through the normal checkout.
 * complete() (from OrderFulfillmentService once paid): SOLD, seller's ticket
 * voided, seller's item marked transferred; the buyer's ticket is issued by
 * the regular OrderPaid flow. releaseReservation(): order canceled/expired
 * -> back on the marketplace.
 */
@Injectable()
export class ResaleService {
  private readonly logger = new Logger(ResaleService.name);
  private readonly holdTtlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
    private readonly eventClient: EventServiceClient,
    private readonly ticketClient: TicketServiceClient,
    config: ConfigService,
  ) {
    this.holdTtlSeconds = Number(config.get<string>("HOLD_TTL_SECONDS") ?? 600);
  }

  async createListing(sellerId: string, ticketId: string, price: number) {
    const lock = await this.ticketClient.resaleLock(ticketId, sellerId);
    try {
      const open = await this.prisma.resaleListing.findFirst({ where: { ticketId, status: { in: [ResaleStatus.ACTIVE, ResaleStatus.RESERVED] } } });
      if (open) return open;

      const item = await this.prisma.orderItem.findUnique({ where: { id: lock.orderItemId }, include: { order: true } });
      if (!item || item.order.userId !== sellerId) throw new ForbiddenException("Vé không thuộc đơn hàng của bạn");
      if (item.order.status !== OrderStatus.TICKET_ISSUED) throw new BadRequestException("Chỉ bán lại được vé của đơn đã phát hành vé");
      if (item.refundedAt || item.transferredAt) throw new BadRequestException("Vé này đã được hoàn hoặc đã bán lại");
      const facePrice = Number(item.price);
      if (facePrice <= 0) throw new BadRequestException("Vé miễn phí không bán lại được");
      if (price > facePrice) throw new BadRequestException(`Giá bán lại không được cao hơn giá gốc (${vnd(facePrice)})`);
      await this.assertResellable(lock.eventId);

      const feeAmount = Math.round((price * RESALE_FEE_PERCENT) / 100);
      const listing = await this.prisma.resaleListing.create({
        data: {
          code: await this.newCode(),
          sellerId,
          eventId: lock.eventId,
          ticketId,
          orderItemId: item.id,
          ticketTypeId: item.ticketTypeId,
          seatId: item.seatId,
          facePrice,
          price,
          feeAmount,
        },
      });
      await this.activity.record({
        action: "resale.listed",
        targetType: "resale_listing",
        targetId: listing.id,
        eventId: listing.eventId,
        subjectUserId: sellerId,
        summary: `Đăng bán lại vé ${listing.code} giá ${vnd(price)}`,
      });
      return listing;
    } catch (err) {
      await this.ticketClient.resaleUnlock(ticketId).catch(() => undefined);
      throw err;
    }
  }

  async cancelListing(id: string, sellerId: string) {
    const listing = await this.prisma.resaleListing.findUnique({ where: { id } });
    if (!listing) throw new NotFoundException("Không tìm thấy tin bán lại");
    if (listing.sellerId !== sellerId) throw new ForbiddenException("Đây không phải tin bán của bạn");
    if (listing.status === ResaleStatus.CANCELED) return listing;
    const { count } = await this.prisma.resaleListing.updateMany({ where: { id, status: ResaleStatus.ACTIVE }, data: { status: ResaleStatus.CANCELED } });
    if (count === 0) {
      throw new ConflictException(listing.status === ResaleStatus.SOLD ? "Vé đã được bán" : "Đang có người thanh toán vé này — thử lại sau ít phút");
    }
    await this.ticketClient.resaleUnlock(listing.ticketId);
    await this.activity.record({ action: "resale.canceled", targetType: "resale_listing", targetId: id, eventId: listing.eventId, subjectUserId: sellerId, summary: `Huỷ tin bán lại ${listing.code}` });
    return this.prisma.resaleListing.findUniqueOrThrow({ where: { id } });
  }

  /** The marketplace — ACTIVE only, never the seller's identity. */
  async listPublic(eventId: string | undefined, page = 1, limit = 24) {
    const where: Prisma.ResaleListingWhereInput = { status: ResaleStatus.ACTIVE, ...(eventId ? { eventId } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.resaleListing.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      this.prisma.resaleListing.count({ where }),
    ]);
    const data = rows.map(({ sellerId: _s, buyerId: _b, reservedOrderId: _r, orderItemId: _o, ticketId: _t, feeAmount: _f, ...pub }) => pub);
    return { data, page, limit, total };
  }

  /** One listing for its public detail page — any status but CANCELED (so a sold one still explains itself), never the seller's identity. */
  async getPublic(id: string) {
    const row = await this.prisma.resaleListing.findUnique({ where: { id } });
    if (!row || row.status === ResaleStatus.CANCELED) throw new NotFoundException("Tin bán lại không còn");
    const { sellerId: _s, buyerId: _b, reservedOrderId: _r, orderItemId: _o, ticketId: _t, feeAmount: _f, ...pub } = row;
    return pub;
  }

  /** "Vé đang bán lại" — the seller's own listings with what they'll receive. */
  async listMine(sellerId: string) {
    const rows = await this.prisma.resaleListing.findMany({ where: { sellerId }, orderBy: { createdAt: "desc" }, take: 100 });
    return rows.map((l) => ({ ...l, payoutAmount: Number(l.price) - Number(l.feeAmount) }));
  }

  async buy(listingId: string, buyerId: string) {
    const listing = await this.prisma.resaleListing.findUnique({ where: { id: listingId } });
    if (!listing || listing.status === ResaleStatus.CANCELED) throw new NotFoundException("Tin bán lại không còn");
    if (listing.sellerId === buyerId) throw new BadRequestException("Bạn không thể mua vé của chính mình");
    if (listing.status === ResaleStatus.RESERVED) {
      // The same buyer coming back to their unpaid order.
      const mine = listing.reservedOrderId ? await this.prisma.order.findUnique({ where: { id: listing.reservedOrderId }, include: { items: true } }) : null;
      if (mine && mine.userId === buyerId && mine.status === OrderStatus.PENDING_PAYMENT) return mine;
      throw new ConflictException("Đang có người thanh toán vé này — thử lại sau ít phút");
    }
    if (listing.status !== ResaleStatus.ACTIVE) throw new ConflictException("Vé đã được bán");
    await this.assertResellable(listing.eventId);

    const orderId = randomUUID();
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.resaleListing.updateMany({
        where: { id: listingId, status: ResaleStatus.ACTIVE },
        data: { status: ResaleStatus.RESERVED, reservedOrderId: orderId },
      });
      if (count === 0) throw new ConflictException("Vé vừa có người khác giữ — thử lại sau ít phút");
      const order = await tx.order.create({
        data: {
          id: orderId,
          userId: buyerId,
          kind: OrderKind.RESALE,
          eventId: listing.eventId,
          resaleListingId: listing.id,
          itemLabel: `Vé bán lại ${listing.code}`,
          subtotal: listing.price,
          totalAmount: listing.price,
          expiresAt: new Date(Date.now() + this.holdTtlSeconds * 1000),
          items: { create: [{ ticketTypeId: listing.ticketTypeId, seatId: listing.seatId, price: listing.price, quantity: 1 }] },
        },
        include: { items: true },
      });
      await this.activity.record({
        action: "order.created",
        targetType: "order",
        targetId: order.id,
        eventId: order.eventId,
        subjectUserId: buyerId,
        summary: `Giữ vé bán lại ${listing.code}, ${vnd(listing.price)} (đơn #${order.id.slice(0, 8)})`,
      });
      return order;
    });
  }

  /** Order canceled/expired before payment — the listing goes back on the marketplace. */
  async releaseReservation(order: Order) {
    if (!order.resaleListingId) return;
    await this.prisma.resaleListing.updateMany({
      where: { id: order.resaleListingId, status: ResaleStatus.RESERVED, reservedOrderId: order.id },
      data: { status: ResaleStatus.ACTIVE, reservedOrderId: null },
    });
  }

  /**
   * Payment confirmed. Returns false if the reservation was lost (the order
   * expired and the ticket went to someone else) — the caller then refunds.
   * Idempotent: a redelivered PaymentSucceeded finds it SOLD to this order.
   */
  async complete(order: Order): Promise<boolean> {
    const listing = order.resaleListingId ? await this.prisma.resaleListing.findUnique({ where: { id: order.resaleListingId } }) : null;
    if (!listing || listing.reservedOrderId !== order.id || (listing.status !== ResaleStatus.RESERVED && listing.status !== ResaleStatus.SOLD)) {
      this.logger.error(`Order ${order.id}: resale reservation lost`);
      return false;
    }
    await this.ticketClient.resaleTransfer(listing.ticketId);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.resaleListing.update({ where: { id: listing.id }, data: { status: ResaleStatus.SOLD, buyerId: order.userId, soldAt: listing.soldAt ?? now } }),
      this.prisma.orderItem.updateMany({ where: { id: listing.orderItemId, transferredAt: null }, data: { transferredAt: now } }),
    ]);
    await this.activity.record({
      action: "resale.sold",
      targetType: "resale_listing",
      targetId: listing.id,
      eventId: listing.eventId,
      subjectUserId: listing.sellerId,
      summary: `Vé ${listing.code} đã bán được ${vnd(listing.price)} — người bán nhận ${vnd(Number(listing.price) - Number(listing.feeAmount))} (phí ${RESALE_FEE_PERCENT}%)`,
    });
    return true;
  }

  private async assertResellable(eventId: string) {
    const event = await this.eventClient.getEvent(eventId);
    if (event.status !== "PUBLISHED" || event.cancelRequestedAt) throw new BadRequestException("Sự kiện không còn cho phép bán lại vé");
    if (new Date(event.startTime).getTime() - Date.now() < CLOSE_BEFORE_START_MS) {
      throw new BadRequestException("Đã quá thời hạn bán lại (đóng 1 giờ trước giờ diễn)");
    }
  }

  private async newCode(): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const code = `RSL-${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
      if (!(await this.prisma.resaleListing.findUnique({ where: { code }, select: { id: true } }))) return code;
    }
    throw new Error("Could not allocate a resale code");
  }
}
