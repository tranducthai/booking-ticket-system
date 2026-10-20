import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventEnvelope, EXCHANGES, ROUTING_KEYS, TicketIssuedPayload } from "@booking-ticket-system/event-contracts";
import { OrderStatus } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { RabbitMqService } from "../rabbitmq/rabbitmq.service";

/**
 * Last hop of the booking saga (docs/spec/09-event-contracts.md):
 * Ticket Service's TicketIssued moves the order PAID -> TICKET_ISSUED.
 * Nothing consumed it before, so every order stayed PAID forever — and
 * payment-service only accepts refund requests for TICKET_ISSUED orders,
 * so customers could never ask for a refund.
 *
 * Idempotent without a ProcessedEvent row: the update is conditional on
 * PAID, so a redelivery (or a TicketIssued for an order that was refunded
 * and CANCELED in the meantime) changes nothing.
 */
@Injectable()
export class TicketIssuedConsumer implements OnModuleInit {
  private readonly logger = new Logger(TicketIssuedConsumer.name);

  constructor(
    private readonly rabbit: RabbitMqService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbit.consume<TicketIssuedPayload>(
      EXCHANGES.TICKET,
      "booking-service.ticket-issued",
      ROUTING_KEYS.TICKET_ISSUED,
      (envelope) => this.onTicketIssued(envelope),
    );
  }

  private async onTicketIssued(envelope: EventEnvelope<TicketIssuedPayload>): Promise<void> {
    const { orderId } = envelope.payload;
    const { count } = await this.prisma.order.updateMany({
      where: { id: orderId, status: OrderStatus.PAID },
      data: { status: OrderStatus.TICKET_ISSUED },
    });
    if (count === 0) {
      this.logger.log(`TicketIssued for order ${orderId} — not PAID (already issued, canceled or unknown), nothing to do`);
    }
  }
}
