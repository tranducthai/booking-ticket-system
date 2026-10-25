import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { vnd } from "../activity-log/format";
import { OrderStatus } from "../generated/prisma";
import {
  EventEnvelope,
  EXCHANGES,
  OrderCanceledPayload,
  RefundApprovedPayload,
  ROUTING_KEYS,
} from "@booking-ticket-system/event-contracts";
import { EventServiceClient } from "../event-client/event-service.client";
import { PrismaService } from "../prisma/prisma.service";
import { RabbitMqService } from "../rabbitmq/rabbitmq.service";

/**
 * Consumes Payment Service's RefundApproved and republishes OrderCanceled
 * for the refunded tickets only (RefundApproved.orderItemIds; absent = the
 * whole order). The order itself becomes CANCELED once none of its tickets
 * is left — until then a per-ticket refund leaves it TICKET_ISSUED with the
 * other tickets valid, and OrderCanceled goes out with `partial: true`.
 *
 * This is the fan-out point in docs/spec/09-event-contracts.md's catalog:
 * Event Service reacts by releasing the seat/restocking GA quantity, Ticket
 * Service reacts by marking the ticket CANCELED. Booking itself never calls
 * either of those services directly for this path (contrast with the
 * synchronous pre-payment cancel in orders.service.ts) since by now a real
 * Ticket may already exist and both those services own that follow-up.
 */
@Injectable()
export class RefundEventsConsumer implements OnModuleInit {
  private readonly logger = new Logger(RefundEventsConsumer.name);

  constructor(
    private readonly rabbit: RabbitMqService,
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
    private readonly eventClient: EventServiceClient,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbit.consume<RefundApprovedPayload>(
      EXCHANGES.PAYMENT,
      "booking-service.refund-approved",
      ROUTING_KEYS.REFUND_APPROVED,
      (envelope) => this.onRefundApproved(envelope),
    );
  }

  private async onRefundApproved(envelope: EventEnvelope<RefundApprovedPayload>): Promise<void> {
    try {
      await this.prisma.processedEvent.create({ data: { eventId: envelope.eventId, consumer: "refund-approved" } });
    } catch {
      this.logger.log(`Duplicate delivery of refund-approved eventId=${envelope.eventId} — skipping`);
      return;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: envelope.payload.orderId },
      include: { items: true },
    });
    if (!order) {
      this.logger.warn(`RefundApproved for unknown order ${envelope.payload.orderId}`);
      return;
    }
    if (order.status === OrderStatus.CANCELED) {
      this.logger.warn(`Order ${order.id} already CANCELED — ignoring redundant RefundApproved`);
      return;
    }

    const requested = envelope.payload.orderItemIds ?? [];
    const refundedItems = order.items.filter((i) => !i.refundedAt && (requested.length === 0 || requested.includes(i.id)));
    const remaining = order.items.filter((i) => !i.refundedAt && !refundedItems.includes(i));
    const fullyCanceled = remaining.length === 0;
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.orderItem.updateMany({ where: { id: { in: refundedItems.map((i) => i.id) }, refundedAt: null }, data: { refundedAt: now } }),
      this.prisma.order.update({
        where: { id: order.id },
        data: {
          refundedAmount: { increment: envelope.payload.amount },
          ...(fullyCanceled ? { status: OrderStatus.CANCELED } : {}),
        },
      }),
    ]);
    await this.activity.record({
      action: fullyCanceled ? "order.refunded" : "order.partially_refunded",
      targetType: "order",
      targetId: order.id,
      eventId: order.eventId,
      subjectUserId: order.userId,
      summary: fullyCanceled
        ? `Đơn #${order.id.slice(0, 8)} đã hoàn ${vnd(envelope.payload.amount)} và bị hủy`
        : `Đơn #${order.id.slice(0, 8)}: hoàn ${vnd(envelope.payload.amount)} cho ${refundedItems.length} vé, còn ${remaining.length} vé hiệu lực`,
      metadata: {
        refundId: envelope.payload.refundId,
        amount: envelope.payload.amount,
        kind: envelope.payload.kind,
        orderItemIds: refundedItems.map((i) => i.id),
      },
    });

    // Every listed ticket was already refunded, or it's a membership order (no tickets, no event) — nothing left to release.
    if (refundedItems.length === 0 || !order.eventId) return;

    // The discount code goes back only when the whole order is gone.
    if (fullyCanceled && order.discountCode) {
      await this.eventClient.releaseDiscountCode(order.eventId, order.discountCode).catch((err) => {
        this.logger.error(`Failed to release discount code ${order.discountCode} for order ${order.id}: ${(err as Error).message}`);
      });
    }

    const payload: OrderCanceledPayload = {
      orderId: order.id,
      userId: order.userId,
      eventId: order.eventId,
      items: refundedItems.map((item) => ({
        orderItemId: item.id,
        ticketTypeId: item.ticketTypeId ?? undefined,
        seatId: item.seatId ?? undefined,
        quantity: item.quantity,
      })),
      ...(fullyCanceled ? {} : { partial: true }),
    };
    await this.rabbit.publish(EXCHANGES.BOOKING, ROUTING_KEYS.ORDER_CANCELED, payload);
  }
}
