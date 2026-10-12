import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventCanceledPayload, EventEnvelope, EXCHANGES, ROUTING_KEYS } from "@booking-ticket-system/event-contracts";
import { PrismaService } from "../prisma/prisma.service";
import { RabbitMqService } from "../rabbitmq/rabbitmq.service";
import { RefundsService } from "./refunds.service";

/**
 * docs/spec/13-refund-and-anti-fraud-design.md §2.3 — EventCanceled ->
 * one APPROVED 100% refund per paid order. Only creates the rows; the
 * gateway calls happen in RefundProcessorService's batches. The
 * ProcessedEvent row is written AFTER the refunds so a crash midway is
 * redelivered and resumed (refundCanceledEvent skips orders it already
 * covered) instead of silently half-done.
 */
@Injectable()
export class EventCanceledConsumer implements OnModuleInit {
  private readonly logger = new Logger(EventCanceledConsumer.name);

  constructor(
    private readonly rabbit: RabbitMqService,
    private readonly prisma: PrismaService,
    private readonly refunds: RefundsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbit.consume<EventCanceledPayload>(
      EXCHANGES.EVENT,
      "payment-service.event-canceled",
      ROUTING_KEYS.EVENT_CANCELED,
      (envelope) => this.onEventCanceled(envelope),
    );
  }

  private async onEventCanceled(envelope: EventEnvelope<EventCanceledPayload>): Promise<void> {
    const seen = await this.prisma.processedEvent.findUnique({ where: { eventId: envelope.eventId } });
    if (seen) {
      this.logger.log(`Duplicate delivery of event-canceled eventId=${envelope.eventId} — skipping`);
      return;
    }
    const created = await this.refunds.refundCanceledEvent(envelope.payload.eventId, envelope.payload.reason);
    await this.prisma.processedEvent.create({ data: { eventId: envelope.eventId, consumer: "event-canceled" } });
    this.logger.log(`Event ${envelope.payload.eventId} canceled — queued ${created} refund(s)`);
  }
}
