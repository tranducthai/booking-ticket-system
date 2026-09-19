import { Injectable, OnModuleInit } from "@nestjs/common";
import {
  EventApprovedPayload,
  EventEnvelope,
  EventRejectedPayload,
  EXCHANGES,
  ROUTING_KEYS,
} from "@booking-ticket-system/event-contracts";
import { NotificationType } from "../generated/prisma";
import { InboxService } from "../inbox/inbox.service";
import { RabbitMqService } from "../rabbitmq/rabbitmq.service";

/**
 * events.service.ts (event-service) publishes these on approve()/reject() —
 * organizer-facing, in-app only (no email template for this one; the
 * organizer dashboard already surfaces event status, this is just the
 * live nudge).
 */
@Injectable()
export class EventStatusConsumer implements OnModuleInit {
  constructor(
    private readonly rabbit: RabbitMqService,
    private readonly inbox: InboxService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbit.consume<EventApprovedPayload>(
      EXCHANGES.EVENT,
      "notification-service.event-approved",
      ROUTING_KEYS.EVENT_APPROVED,
      (envelope) => this.onApproved(envelope),
    );
    await this.rabbit.consume<EventRejectedPayload>(
      EXCHANGES.EVENT,
      "notification-service.event-rejected",
      ROUTING_KEYS.EVENT_REJECTED,
      (envelope) => this.onRejected(envelope),
    );
  }

  private async onApproved(envelope: EventEnvelope<EventApprovedPayload>): Promise<void> {
    const { eventId, organizerId, title } = envelope.payload;
    await this.inbox.create({
      userId: organizerId,
      type: NotificationType.EVENT_APPROVED,
      title: "Sự kiện đã được duyệt",
      body: `"${title}" đã được duyệt và công khai.`,
      data: { eventId },
    });
  }

  private async onRejected(envelope: EventEnvelope<EventRejectedPayload>): Promise<void> {
    const { eventId, organizerId, title, reason } = envelope.payload;
    await this.inbox.create({
      userId: organizerId,
      type: NotificationType.EVENT_REJECTED,
      title: "Sự kiện bị từ chối",
      body: `"${title}" bị từ chối: ${reason}`,
      data: { eventId },
    });
  }
}
