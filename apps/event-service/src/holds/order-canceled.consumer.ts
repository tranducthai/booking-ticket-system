import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventEnvelope, EXCHANGES, OrderCanceledPayload, ROUTING_KEYS } from "@booking-ticket-system/event-contracts";
import { RabbitMqService } from "../rabbitmq/rabbitmq.service";
import { HoldsService } from "./holds.service";

/**
 * Event Service's half of the OrderCanceled fan-out (docs/spec/09-event-contracts.md
 * catalog: "Event Service releases the seat/restocks quantity"). Not called
 * out under any single roadmap phase explicitly — it's the other side of
 * Booking Service's RefundApproved -> OrderCanceled republish (Phase 4/5),
 * so it lands alongside that work.
 */
@Injectable()
export class OrderCanceledConsumer implements OnModuleInit {
  private readonly logger = new Logger(OrderCanceledConsumer.name);

  constructor(
    private readonly rabbit: RabbitMqService,
    private readonly holdsService: HoldsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbit.consume<OrderCanceledPayload>(
      EXCHANGES.BOOKING,
      "event-service.order-canceled",
      ROUTING_KEYS.ORDER_CANCELED,
      (envelope) => this.onOrderCanceled(envelope),
    );
  }

  private async onOrderCanceled(envelope: EventEnvelope<OrderCanceledPayload>): Promise<void> {
    for (const item of envelope.payload.items) {
      try {
        if (item.seatId) {
          await this.holdsService.releaseSeat(item.seatId);
        } else if (item.ticketTypeId) {
          await this.holdsService.releaseTicketType(item.ticketTypeId, item.quantity);
        }
      } catch (err) {
        // Logged, not rethrown — one bad item shouldn't nack the whole
        // envelope and dead-letter the rest of a multi-item order's release.
        this.logger.error(
          `Failed to release item ${JSON.stringify(item)} for canceled order ${envelope.payload.orderId}: ${(err as Error).message}`,
        );
      }
    }
  }
}
