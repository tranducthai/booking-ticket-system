import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { OrderStatus } from "@prisma/client";
import {
  EventEnvelope,
  EXCHANGES,
  OrderPaidPayload,
  PaymentFailedPayload,
  PaymentSucceededPayload,
  ROUTING_KEYS,
} from "@booking-ticket-system/event-contracts";
import { EventServiceClient } from "../event-client/event-service.client";
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
    private readonly eventClient: EventServiceClient,
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
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      this.logger.warn(`PaymentSucceeded for order ${order.id} already in status ${order.status} — ignoring`);
      return;
    }

    // Only seats need an explicit confirm — GA quantity was already
    // permanently decremented at reserve time (event-service holds.service.ts).
    for (const item of order.items) {
      if (item.seatId) {
        await this.eventClient.confirmSeat(item.seatId);
      }
    }

    await this.prisma.order.update({ where: { id: order.id }, data: { status: OrderStatus.PAID } });

    const payload: OrderPaidPayload = {
      orderId: order.id,
      userId: order.userId,
      eventId: order.eventId,
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

  private async onPaymentFailed(envelope: EventEnvelope<PaymentFailedPayload>): Promise<void> {
    const alreadyProcessed = await this.markProcessedOnce(envelope.eventId, "payment-failed");
    if (!alreadyProcessed) return;

    const order = await this.prisma.order.findUnique({ where: { id: envelope.payload.orderId }, include: { items: true } });
    if (!order || order.status !== OrderStatus.PENDING_PAYMENT) {
      this.logger.warn(`PaymentFailed for order ${envelope.payload.orderId} — not pending, ignoring`);
      return;
    }

    for (const item of order.items) {
      if (item.seatId) {
        await this.eventClient.releaseSeat(item.seatId);
      } else if (item.ticketTypeId) {
        await this.eventClient.releaseTicketType(item.ticketTypeId, item.quantity);
      }
    }

    await this.prisma.order.update({ where: { id: order.id }, data: { status: OrderStatus.EXPIRED } });
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
