import { ConflictException, Injectable, Logger } from "@nestjs/common";
import { EXCHANGES, OrderPaidPayload, ROUTING_KEYS } from "@booking-ticket-system/event-contracts";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { vnd } from "../activity-log/format";
import { EventServiceClient } from "../event-client/event-service.client";
import { Order, OrderItem, OrderKind, OrderStatus } from "../generated/prisma";
import { MetricsService } from "../metrics/metrics.service";
import { PaymentServiceClient } from "../payment-client/payment-service.client";
import { PrismaService } from "../prisma/prisma.service";
import { ResaleService } from "../resale/resale.service";
import { RabbitMqService } from "../rabbitmq/rabbitmq.service";

/**
 * PENDING_PAYMENT -> PAID and everything that goes with it: confirm held
 * seats, redeem the discount code, publish OrderPaid (ticket-service issues
 * the tickets). Shared by the payment saga (PaymentEventsConsumer, after a
 * gateway confirms money moved) and free orders (OrdersService.confirmFree —
 * a 0đ order never goes through a gateway).
 */
@Injectable()
export class OrderFulfillmentService {
  private readonly logger = new Logger(OrderFulfillmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
    private readonly eventClient: EventServiceClient,
    private readonly paymentClient: PaymentServiceClient,
    private readonly rabbit: RabbitMqService,
    private readonly metrics: MetricsService,
    private readonly resale: ResaleService,
  ) {}

  /** `order` must be PENDING_PAYMENT (callers check). */
  async markPaid(order: Order & { items: OrderItem[] }, meta: { paymentId?: string; method?: string; free?: boolean }): Promise<void> {
    if (order.kind === OrderKind.MEMBERSHIP) return this.activateMembership(order, meta);
    if (!order.eventId) throw new Error(`Ticket order ${order.id} has no eventId`);
    const eventId = order.eventId;

    // Only seats need an explicit confirm — GA quantity was already
    // permanently decremented at reserve time (event-service holds.service.ts).
    // A resale has no hold: completing the listing voids the seller's ticket.
    let anyHoldLost = false;
    if (order.kind === OrderKind.RESALE) anyHoldLost = !(await this.resale.complete(order));
    for (const item of order.kind === OrderKind.RESALE ? [] : order.items) {
      if (item.seatId) {
        const { holdLost } = await this.eventClient.confirmSeat(item.seatId, order.id, order.userId);
        if (holdLost) anyHoldLost = true;
      }
    }

    if (anyHoldLost && meta.free) {
      // Nothing was paid, so nothing to refund — the buyer just picks again.
      throw new ConflictException("Ghế đã hết thời gian giữ — vui lòng chọn lại");
    }
    if (anyHoldLost) {
      // docs/spec/12-resilience-and-failure-design.md "on a lost hold at
      // confirm, fire a compensating auto-refund instead of BOOKED".
      // Payment already succeeded (real money moved) — the order must NOT
      // become PAID/ticketed for a seat that's no longer actually held.
      // Simplification: a lost hold on ANY item cancels the WHOLE order
      // rather than partially refunding just that item — safer (never
      // oversells) at the cost of occasionally refunding a bit more than
      // strictly necessary for a multi-seat order.
      this.logger.error(`Order ${order.id}: lost hold on confirm — triggering compensating auto-refund`);
      this.metrics.autoRefundsTotal.inc();
      try {
        await this.paymentClient.autoRefund(order.id, "System: seat hold lost before payment could be confirmed");
        await this.activity.record({
          action: "order.auto_refunded",
          targetType: "order",
          targetId: order.id,
          eventId: order.eventId,
          subjectUserId: order.userId,
          summary: `Mất giữ ghế khi xác nhận đơn #${order.id.slice(0, 8)} — hoàn tiền tự động`,
        });
      } catch {
        // Already logged loudly inside paymentClient.autoRefund — order
        // stays PENDING_PAYMENT here so it's visibly wrong rather than
        // silently marked something misleading; needs manual intervention.
      }
      return;
    }

    if (order.discountCode) {
      const redeemed = await this.eventClient.redeemDiscountCode(eventId, order.discountCode);
      if (!redeemed) {
        // Not fatal — the customer already paid the discounted price they
        // were shown at checkout; a race that exhausted the code between
        // "apply" and "confirm" is logged for the organizer to notice, not
        // grounds to cancel an already-paid order over.
        this.logger.warn(`Order ${order.id}: discount code ${order.discountCode} could not be redeemed (exhausted)`);
      }
    }

    await this.prisma.order.update({ where: { id: order.id }, data: { status: OrderStatus.PAID } });
    this.metrics.ordersPaidTotal.inc();
    this.metrics.holdToPaidSeconds.observe((Date.now() - order.createdAt.getTime()) / 1000);
    // The organizer's "who bought tickets" trail (docs/spec/14 §2).
    const quantity = order.items.reduce((sum, i) => sum + i.quantity, 0);
    await this.activity.record({
      action: "order.paid",
      targetType: "order",
      targetId: order.id,
      eventId: order.eventId,
      subjectUserId: order.userId,
      summary: meta.free
        ? `Đăng ký miễn phí ${quantity} vé (đơn #${order.id.slice(0, 8)})`
        : `Thanh toán thành công ${quantity} vé — ${vnd(order.totalAmount)} (đơn #${order.id.slice(0, 8)})`,
      metadata: { quantity, totalAmount: Number(order.totalAmount), paymentId: meta.paymentId, method: meta.method },
    });

    const payload: OrderPaidPayload = {
      orderId: order.id,
      userId: order.userId,
      eventId,
      items: order.items.map((item) => ({
        orderItemId: item.id,
        ticketTypeId: item.ticketTypeId ?? undefined,
        seatId: item.seatId ?? undefined,
        quantity: item.quantity,
        price: Number(item.price),
      })),
    };
    await this.rabbit.publish(EXCHANGES.BOOKING, ROUTING_KEYS.ORDER_PAID, payload);
  }

  /**
   * A paid membership order activates the card in event-service — no tickets,
   * no OrderPaid. The order goes straight to PAID, its final state. If
   * event-service is down this throws: the payment consumer's nack retries it
   * through the DLQ, and activation is idempotent on the order id.
   */
  private async activateMembership(order: Order, meta: { paymentId?: string; method?: string; free?: boolean }): Promise<void> {
    const card = await this.eventClient.activateMembership({
      orderId: order.id,
      planId: order.membershipPlanId!,
      userId: order.userId,
      pricePaid: Number(order.totalAmount),
    });
    await this.prisma.order.update({ where: { id: order.id }, data: { status: OrderStatus.PAID } });
    this.metrics.ordersPaidTotal.inc();
    await this.activity.record({
      action: "membership.activated",
      targetType: "order",
      targetId: order.id,
      subjectUserId: order.userId,
      summary: meta.free
        ? `Đăng ký ${order.itemLabel ?? "thẻ thành viên"} — thẻ ${card.cardNumber}`
        : `Mua ${order.itemLabel ?? "thẻ thành viên"} — ${vnd(order.totalAmount)}, thẻ ${card.cardNumber}`,
      metadata: { cardNumber: card.cardNumber, paymentId: meta.paymentId, method: meta.method },
    });
  }
}
