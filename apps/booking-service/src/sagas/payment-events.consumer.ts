import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { OrderStatus } from "../generated/prisma";
import {
  EventEnvelope,
  EXCHANGES,
  PaymentFailedPayload,
  PaymentSucceededPayload,
  ROUTING_KEYS,
} from "@booking-ticket-system/event-contracts";
import { MetricsService } from "../metrics/metrics.service";
import { HoldsReleaseService } from "../orders/holds-release.service";
import { OrderFulfillmentService } from "../orders/order-fulfillment.service";
import { PaymentServiceClient } from "../payment-client/payment-service.client";
import { PrismaService } from "../prisma/prisma.service";
import { RabbitMqService } from "../rabbitmq/rabbitmq.service";

/**
 * Consumes Payment Service's two outcomes (docs/spec/09-event-contracts.md
 * catalog) and drives the Order state machine. This is the choreography
 * "hop" from Payment -> Booking described in docs/spec/03-system-design.md.
 */
@Injectable()
export class PaymentEventsConsumer implements OnModuleInit {
  private readonly logger = new Logger(PaymentEventsConsumer.name);

  constructor(
    private readonly rabbit: RabbitMqService,
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
    private readonly paymentClient: PaymentServiceClient,
    private readonly holdsRelease: HoldsReleaseService,
    private readonly metrics: MetricsService,
    private readonly fulfillment: OrderFulfillmentService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbit.consume<PaymentSucceededPayload>(
      EXCHANGES.PAYMENT,
      "booking-service.payment-succeeded",
      ROUTING_KEYS.PAYMENT_SUCCEEDED,
      (envelope) => this.onPaymentSucceeded(envelope),
    );
    await this.rabbit.consume<PaymentFailedPayload>(
      EXCHANGES.PAYMENT,
      "booking-service.payment-failed",
      ROUTING_KEYS.PAYMENT_FAILED,
      (envelope) => this.onPaymentFailed(envelope),
    );
  }

  private async onPaymentSucceeded(envelope: EventEnvelope<PaymentSucceededPayload>): Promise<void> {
    const alreadyProcessed = await this.markProcessedOnce(envelope.eventId, "payment-succeeded");
    if (!alreadyProcessed) return;

    const order = await this.prisma.order.findUnique({ where: { id: envelope.payload.orderId }, include: { items: true } });
    if (!order) {
      this.logger.warn(`PaymentSucceeded for unknown order ${envelope.payload.orderId}`);
      return;
    }
    if (order.status === OrderStatus.CANCELED || order.status === OrderStatus.EXPIRED) {
      // Money moved for an order that's already dead — the customer
      // canceled it, or its event was canceled (EventCanceledConsumer),
      // while they were on the gateway page. Hand the money back;
      // RefundApproved will find the order already CANCELED and no-op.
      this.logger.error(`PaymentSucceeded for already-CANCELED order ${order.id} — triggering compensating auto-refund`);
      this.metrics.autoRefundsTotal.inc();
      await this.paymentClient.autoRefund(order.id, "System: order was canceled before payment completed").catch(() => undefined);
      await this.activity.record({
        action: "order.auto_refunded",
        targetType: "order",
        targetId: order.id,
        eventId: order.eventId,
        subjectUserId: order.userId,
        summary: `Thanh toán đến sau khi đơn #${order.id.slice(0, 8)} đã hủy — hoàn tiền tự động`,
      });
      return;
    }
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      this.logger.warn(`PaymentSucceeded for order ${order.id} already in status ${order.status} — ignoring`);
      return;
    }

    await this.fulfillment.markPaid(order, { paymentId: envelope.payload.paymentId, method: envelope.payload.method });
  }

  private async onPaymentFailed(envelope: EventEnvelope<PaymentFailedPayload>): Promise<void> {
    const alreadyProcessed = await this.markProcessedOnce(envelope.eventId, "payment-failed");
    if (!alreadyProcessed) return;

    const order = await this.prisma.order.findUnique({ where: { id: envelope.payload.orderId }, include: { items: true } });
    if (!order || order.status !== OrderStatus.PENDING_PAYMENT) {
      this.logger.warn(`PaymentFailed for order ${envelope.payload.orderId} — not pending, ignoring`);
      return;
    }

    await this.holdsRelease.releaseOnce(order);
    await this.prisma.order.update({ where: { id: order.id }, data: { status: OrderStatus.EXPIRED } });
    this.metrics.ordersExpiredTotal.inc({ source: "payment-failed" });
    await this.activity.record({
      action: "order.payment_failed",
      targetType: "order",
      targetId: order.id,
      eventId: order.eventId,
      subjectUserId: order.userId,
      summary: `Thanh toán thất bại, đơn #${order.id.slice(0, 8)} đã hủy giữ chỗ`,
      metadata: { reason: envelope.payload.reason },
    });
  }

  /**
   * Returns true the FIRST time this eventId is seen (caller should act),
   * false on a redelivery (caller should no-op). See ProcessedEvent in
   * prisma/schema.prisma — pulled forward from Phase 8c.
   */
  private async markProcessedOnce(eventId: string, consumer: string): Promise<boolean> {
    try {
      await this.prisma.processedEvent.create({ data: { eventId, consumer } });
      return true;
    } catch {
      // Unique constraint violation -> already processed.
      this.logger.log(`Duplicate delivery of ${consumer} eventId=${eventId} — skipping`);
      return false;
    }
  }
}
