import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventEnvelope, EXCHANGES, OrderCanceledPayload, ROUTING_KEYS } from "@booking-ticket-system/event-contracts";
import { TicketStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RabbitMqService } from "../rabbitmq/rabbitmq.service";

/** docs/spec/09-event-contracts.md catalog: OrderCanceled -> Ticket Service marks the ticket CANCELED. */
@Injectable()
export class OrderCanceledConsumer implements OnModuleInit {
  private readonly logger = new Logger(OrderCanceledConsumer.name);

  constructor(
    private readonly rabbit: RabbitMqService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbit.consume<OrderCanceledPayload>(
      EXCHANGES.BOOKING,
      "ticket-service.order-canceled",
      ROUTING_KEYS.ORDER_CANCELED,
      (envelope) => this.onOrderCanceled(envelope),
    );
  }

  private async onOrderCanceled(envelope: EventEnvelope<OrderCanceledPayload>): Promise<void> {
    try {
      await this.prisma.processedEvent.create({ data: { eventId: envelope.eventId, consumer: "order-canceled" } });
    } catch {
      this.logger.log(`Duplicate delivery of order-canceled eventId=${envelope.eventId} — skipping`);
      return;
    }

    for (const item of envelope.payload.items) {
      // No ticket exists if the order was canceled before ever being paid —
      // updateMany is a safe no-op in that case instead of a lookup + 404.
      await this.prisma.ticket.updateMany({
        where: { orderItemId: item.orderItemId, status: { not: TicketStatus.USED } },
        data: { status: TicketStatus.CANCELED },
      });
    }
  }
}
