import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventCanceledPayload, EventEnvelope, EXCHANGES, ROUTING_KEYS } from "@booking-ticket-system/event-contracts";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { TicketStatus } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { RabbitMqService } from "../rabbitmq/rabbitmq.service";
import { EVENT_CANCELED_REASON } from "../tickets/tickets.service";

/**
 * docs/spec/13-refund-and-anti-fraud-design.md §2.3 — every not-yet-used
 * ticket of a canceled event dies immediately, before any money moves, so
 * there's no window where a refunded ticket still scans. REFUND_PENDING
 * tickets are included: their open request is superseded by the 100%
 * event-cancellation refund.
 */
@Injectable()
export class EventCanceledConsumer implements OnModuleInit {
  private readonly logger = new Logger(EventCanceledConsumer.name);

  constructor(
    private readonly rabbit: RabbitMqService,
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbit.consume<EventCanceledPayload>(
      EXCHANGES.EVENT,
      "ticket-service.event-canceled",
      ROUTING_KEYS.EVENT_CANCELED,
      (envelope) => this.onEventCanceled(envelope),
    );
  }

  private async onEventCanceled(envelope: EventEnvelope<EventCanceledPayload>): Promise<void> {
    // No ProcessedEvent guard needed: the update is naturally idempotent
    // (a redelivery finds nothing left in ISSUED/REFUND_PENDING).
    const { count } = await this.prisma.ticket.updateMany({
      where: { eventId: envelope.payload.eventId, status: { in: [TicketStatus.ISSUED, TicketStatus.REFUND_PENDING] } },
      data: { status: TicketStatus.CANCELED, cancelReason: EVENT_CANCELED_REASON, refundId: null },
    });
    this.logger.log(`Event ${envelope.payload.eventId} canceled — voided ${count} ticket(s)`);
    if (count > 0) {
      await this.activity.record({
        action: "ticket.voided",
        targetType: "event",
        targetId: envelope.payload.eventId,
        eventId: envelope.payload.eventId,
        summary: `Vô hiệu ${count} vé do sự kiện bị hủy`,
        metadata: { count },
      });
    }
  }
}
