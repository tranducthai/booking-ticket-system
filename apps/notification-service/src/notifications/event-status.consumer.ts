import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { eventApprovedEmail, eventRejectedEmail } from "@booking-ticket-system/email-templates";
import {
  EventApprovedPayload,
  EventEnvelope,
  EventRejectedPayload,
  EXCHANGES,
  ROUTING_KEYS,
} from "@booking-ticket-system/event-contracts";
import { NotificationType } from "../generated/prisma";
import { InboxService } from "../inbox/inbox.service";
import { MailerService } from "../mailer/mailer.service";
import { RabbitMqService } from "../rabbitmq/rabbitmq.service";
import { UserServiceClient } from "../user-client/user-service.client";
import { frontendUrl } from "./frontend-url";

/**
 * events.service.ts (event-service) publishes these on approve()/reject() —
 * organizer-facing: the in-app nudge first, then an email (the organizer
 * may well not be logged in when an admin reviews their event, and a
 * rejection reason needs acting on).
 */
@Injectable()
export class EventStatusConsumer implements OnModuleInit {
  private readonly logger = new Logger(EventStatusConsumer.name);

  constructor(
    private readonly rabbit: RabbitMqService,
    private readonly inbox: InboxService,
    private readonly userClient: UserServiceClient,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
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

  private manageUrl(eventId: string): string {
    return `${frontendUrl(this.config)}/kenh-to-chuc/su-kien/${eventId}`;
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

    const organizer = await this.userClient.findById(organizerId);
    if (!organizer) {
      this.logger.warn(`Could not resolve organizer ${organizerId} — skipping event-approved email`);
      return;
    }
    const { subject, html } = eventApprovedEmail({ fullName: organizer.fullName, eventTitle: title, manageUrl: this.manageUrl(eventId) });
    await this.mailer.send(organizer.email, subject, html);
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

    const organizer = await this.userClient.findById(organizerId);
    if (!organizer) {
      this.logger.warn(`Could not resolve organizer ${organizerId} — skipping event-rejected email`);
      return;
    }
    const { subject, html } = eventRejectedEmail({
      fullName: organizer.fullName,
      eventTitle: title,
      reason,
      manageUrl: this.manageUrl(eventId),
    });
    await this.mailer.send(organizer.email, subject, html);
  }
}
