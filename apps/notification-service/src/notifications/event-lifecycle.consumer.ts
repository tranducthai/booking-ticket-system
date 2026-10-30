import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { eventCanceledEmail, eventPostponedEmail, EmailContent } from "@booking-ticket-system/email-templates";
import {
  EventCanceledPayload,
  EventEnvelope,
  EventPostponedPayload,
  EXCHANGES,
  ROUTING_KEYS,
} from "@booking-ticket-system/event-contracts";
import { NotificationType } from "../generated/prisma";
import { InboxService } from "../inbox/inbox.service";
import { MailerService } from "../mailer/mailer.service";
import { RabbitMqService } from "../rabbitmq/rabbitmq.service";
import { TicketServiceClient } from "../ticket-client/ticket-service.client";
import { UserServiceClient } from "../user-client/user-service.client";
import { frontendUrl } from "./frontend-url";

const formatWhen = (iso: string) => new Date(iso).toLocaleString("vi-VN", { dateStyle: "full", timeStyle: "short" });

/**
 * docs/spec/13-refund-and-anti-fraud-design.md §2.3/§2.4 — tells every
 * ticket holder (email + in-app) that their event was canceled or moved.
 * Recipients come from ticket-service; for a cancellation it is asked to
 * include tickets voided BY the cancellation, since ticket-service's own
 * EventCanceled consumer may well have run first.
 */
@Injectable()
export class EventLifecycleConsumer implements OnModuleInit {
  private readonly logger = new Logger(EventLifecycleConsumer.name);

  constructor(
    private readonly rabbit: RabbitMqService,
    private readonly inbox: InboxService,
    private readonly mailer: MailerService,
    private readonly ticketClient: TicketServiceClient,
    private readonly userClient: UserServiceClient,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbit.consume<EventCanceledPayload>(
      EXCHANGES.EVENT,
      "notification-service.event-canceled",
      ROUTING_KEYS.EVENT_CANCELED,
      (envelope) => this.onCanceled(envelope),
    );
    await this.rabbit.consume<EventPostponedPayload>(
      EXCHANGES.EVENT,
      "notification-service.event-postponed",
      ROUTING_KEYS.EVENT_POSTPONED,
      (envelope) => this.onPostponed(envelope),
    );
  }

  private async onCanceled(envelope: EventEnvelope<EventCanceledPayload>): Promise<void> {
    const { eventId, organizerId, title, reason } = envelope.payload;
    await this.inbox.create({
      userId: organizerId,
      type: NotificationType.EVENT_CANCELED,
      title: "Sự kiện đã bị hủy",
      body: `"${title}" đã bị hủy. Toàn bộ vé đã bán đang được hoàn tiền tự động.`,
      data: { eventId },
    });
    const holders = await this.ticketClient.attendeeUserIds(eventId, true);
    await this.notifyAll(holders, eventId, title, NotificationType.EVENT_CANCELED, "Sự kiện đã bị hủy", `"${title}" đã bị hủy — vé của bạn sẽ được hoàn 100% tự động.`, (fullName) =>
      eventCanceledEmail({ fullName, eventTitle: title, reason, ordersUrl: `${frontendUrl(this.config)}/orders` }),
    );
  }

  private async onPostponed(envelope: EventEnvelope<EventPostponedPayload>): Promise<void> {
    const { eventId, title, newStartTime, refundWindowEndsAt } = envelope.payload;
    const newWhen = formatWhen(newStartTime);
    const refundDeadline = formatWhen(refundWindowEndsAt);
    const holders = await this.ticketClient.attendeeUserIds(eventId);
    await this.notifyAll(
      holders,
      eventId,
      title,
      NotificationType.EVENT_POSTPONED,
      "Sự kiện đổi lịch",
      `"${title}" dời sang ${newWhen}. Vé vẫn có hiệu lực; có thể hoàn 100% trước ${refundDeadline}.`,
      (fullName) => eventPostponedEmail({ fullName, eventTitle: title, newWhen, refundDeadline, ordersUrl: `${frontendUrl(this.config)}/orders` }),
    );
  }

  private async notifyAll(
    userIds: string[],
    eventId: string,
    title: string,
    type: NotificationType,
    inboxTitle: string,
    inboxBody: string,
    email: (fullName: string) => EmailContent,
  ): Promise<void> {
    let sent = 0;
    for (const userId of userIds) {
      await this.inbox.create({ userId, type, title: inboxTitle, body: inboxBody, data: { eventId } });
      const user = await this.userClient.findById(userId);
      if (!user) continue;
      try {
        const { subject, html } = email(user.fullName);
        await this.mailer.send(user.email, subject, html);
        sent++;
      } catch {
        // Already logged inside MailerService — one bad address mustn't stop the rest.
      }
    }
    this.logger.log(`${type} for "${title}" (${eventId}): emailed ${sent}/${userIds.length} holder(s)`);
  }
}
