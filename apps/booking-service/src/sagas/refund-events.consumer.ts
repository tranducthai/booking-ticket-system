import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { OrderStatus } from "../generated/prisma";
import {
  EventEnvelope,
  EXCHANGES,
  OrderCanceledPayload,
  RefundApprovedPayload,
  ROUTING_KEYS,
} from "@booking-ticket-system/event-contracts";
import { PrismaService } from "../prisma/prisma.service";
import { RabbitMqService } from "../rabbitmq/rabbitmq.service";

/**
 * Consumes Payment Service's RefundApproved and republishes OrderCanceled —
 * this is the fan-out point in docs/spec/09-event-contracts.md's catalog:
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

    await this.prisma.order.update({ where: { id: order.id }, data: { status: OrderStatus.CANCELED } });

    const payload: OrderCanceledPayload = {
      orderId: order.id,
      eventId: order.eventId,
      items: order.items.map((item) => ({
        orderItemId: item.id,
        ticketTypeId: item.ticketTypeId ?? undefined,
        seatId: item.seatId ?? undefined,
        quantity: item.quantity,
      })),
    };
    await this.rabbit.publish(EXCHANGES.BOOKING, ROUTING_KEYS.ORDER_CANCELED, payload);
  }
}
