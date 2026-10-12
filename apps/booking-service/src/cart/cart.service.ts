import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { vnd } from "../activity-log/format";
import { EventServiceClient } from "../event-client/event-service.client";
import { OrderStatus } from "../generated/prisma";
import { MetricsService } from "../metrics/metrics.service";
import { PrismaService } from "../prisma/prisma.service";
import { HoldCartDto } from "./dto/hold-cart.dto";

type Acquired = { kind: "ticketType"; ticketTypeId: string; quantity: number };

/**
 * POST /cart/hold (docs/spec/08-api-contracts.md §3) — the write-path entry
 * point of the whole booking Saga (docs/spec/03-system-design.md, step 1).
 * Seat items are acquired in ONE atomic batch call (event-service's
 * SeatLockService.tryAcquireAll — docs/spec/12-resilience-and-failure-design.md
 * "atomic multi-seat hold"): all-or-nothing, no partial-hold rollback
 * needed for seats specifically. GA ticket-type items still go through the
 * sequential reserve-with-rollback path below since each is an independent
 * Postgres atomic UPDATE, not a Redis lock.
 */
@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);
  private readonly holdTtlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
    private readonly eventClient: EventServiceClient,
    private readonly metrics: MetricsService,
    config: ConfigService,
  ) {
    this.holdTtlSeconds = Number(config.get<string>("HOLD_TTL_SECONDS") ?? 600);
  }

  async holdCart(userId: string, dto: HoldCartDto, queueSession?: string) {
    const seatIds: string[] = [];
    const ticketTypeItems: Array<{ ticketTypeId: string; quantity: number }> = [];
    let requestedQuantity = 0;
    for (const item of dto.items) {
      if (item.seatId && item.ticketTypeId) {
        throw new BadRequestException("An item can't have both seatId and ticketTypeId");
      }
      if (item.seatId) {
        seatIds.push(item.seatId);
        requestedQuantity += 1;
      } else if (item.ticketTypeId) {
        const quantity = item.quantity ?? 1;
        ticketTypeItems.push({ ticketTypeId: item.ticketTypeId, quantity });
        requestedQuantity += quantity;
      } else {
        throw new BadRequestException("Each item needs either seatId or ticketTypeId");
      }
    }

    await this.assertOnSaleAndWithinAccountLimit(userId, dto.eventId, requestedQuantity, queueSession);

    const orderId = randomUUID();
    const itemsData: { ticketTypeId?: string; seatId?: string; price: number; quantity: number }[] = [];
    let subtotal = 0;
    const acquiredTicketTypes: Acquired[] = [];

    try {
      // Seats first, as one atomic batch — if any seat in the batch is
      // unavailable this throws immediately, before any GA reservation
      // (which would otherwise need its own rollback) is ever attempted.
      if (seatIds.length > 0) {
        const held = await this.eventClient.holdSeatsBatch(seatIds, orderId, userId);
        for (const h of held) {
          itemsData.push({ seatId: h.seatId, price: h.price, quantity: 1 });
          subtotal += h.price;
        }
      }

      for (const { ticketTypeId, quantity } of ticketTypeItems) {
        const reserved = await this.eventClient.reserveTicketType(ticketTypeId, quantity);
        acquiredTicketTypes.push({ kind: "ticketType", ticketTypeId, quantity });
        itemsData.push({ ticketTypeId, price: reserved.price, quantity });
        subtotal += reserved.price * quantity;
      }
    } catch (err) {
      await this.rollback(orderId, userId, seatIds, acquiredTicketTypes);
      throw err;
    }

    const order = await this.prisma.order.create({
      data: {
        id: orderId,
        userId,
        eventId: dto.eventId,
        subtotal,
        totalAmount: subtotal,
        expiresAt: new Date(Date.now() + this.holdTtlSeconds * 1000),
        items: { create: itemsData },
      },
      include: { items: true },
    });
    this.metrics.ordersCreatedTotal.inc();
    const quantity = order.items.reduce((sum, i) => sum + i.quantity, 0);
    await this.activity.record({
      action: "order.created",
      targetType: "order",
      targetId: order.id,
      eventId: order.eventId,
      subjectUserId: userId,
      summary: `Giữ ${quantity} vé, tạm tính ${vnd(order.totalAmount)} (đơn #${order.id.slice(0, 8)})`,
      metadata: { quantity, totalAmount: Number(order.totalAmount) },
    });
    return order;
  }

  /**
   * Checked before any inventory is reserved — the only point with userId +
   * eventId + requested quantity all in hand, so a user who's already at
   * the cap fails fast instead of tying up a seat/GA slot first. Counts
   * every non-terminal-failed order (PENDING_PAYMENT/PAID/TICKET_ISSUED);
   * CANCELED/EXPIRED orders released their inventory and shouldn't count
   * against the cap.
   */
  private async assertOnSaleAndWithinAccountLimit(
    userId: string,
    eventId: string,
    requestedQuantity: number,
    queueSession?: string,
  ): Promise<void> {
    const event = await this.eventClient.getEvent(eventId);
    // docs/spec/13-refund-and-anti-fraud-design.md §2.3 — sales stop the
    // moment the organizer files a cancellation request, not only once an
    // admin approves it.
    if (event.status !== "PUBLISHED" || event.cancelRequestedAt) {
      throw new BadRequestException("Sự kiện không còn mở bán");
    }
    // The waiting room used to gate only READING a high-demand event; a bot
    // could skip the queue and hold seats here directly.
    if (event.highDemand && !(queueSession && (await this.eventClient.isQueueSessionAdmitted(eventId, queueSession)))) {
      throw new ForbiddenException("Sự kiện đang dùng phòng chờ — vui lòng xếp hàng trước khi giữ vé");
    }
    if (event.maxTicketsPerAccount == null) return;

    const existingOrders = await this.prisma.order.findMany({
      where: { userId, eventId, status: { in: [OrderStatus.PENDING_PAYMENT, OrderStatus.PAID, OrderStatus.TICKET_ISSUED] } },
      include: { items: true },
    });
    const alreadyHeld = existingOrders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0);

    if (alreadyHeld + requestedQuantity > event.maxTicketsPerAccount) {
      const remaining = Math.max(0, event.maxTicketsPerAccount - alreadyHeld);
      throw new BadRequestException(
        `Mỗi tài khoản chỉ được mua tối đa ${event.maxTicketsPerAccount} vé cho sự kiện này (còn lại ${remaining}).`,
      );
    }
  }

  /**
   * Best-effort compensating release. Seats: only released if the batch
   * hold itself succeeded before a later GA reservation failed (releasing
   * seats that were never actually acquired is a harmless no-op on
   * event-service's side — releaseIfOwner just finds nothing to release).
   * StaleHoldSweeper (event-service, Phase 8c) reconciles anything missed.
   */
  private async rollback(orderId: string, userId: string, seatIds: string[], ticketTypes: Acquired[]): Promise<void> {
    for (const seatId of seatIds) {
      try {
        await this.eventClient.releaseSeat(seatId, orderId, userId);
      } catch (err) {
        this.logger.error(`Rollback release failed for seat ${seatId}: ${(err as Error).message}`);
      }
    }
    for (const a of ticketTypes) {
      try {
        await this.eventClient.releaseTicketType(a.ticketTypeId, a.quantity);
      } catch (err) {
        this.logger.error(`Rollback release failed for ${JSON.stringify(a)}: ${(err as Error).message}`);
      }
    }
  }
}
