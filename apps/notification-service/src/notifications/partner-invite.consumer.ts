import { Injectable, OnModuleInit } from "@nestjs/common";
import { partnerInviteEmail } from "@booking-ticket-system/email-templates";
import { EventEnvelope, EXCHANGES, PartnerInvitedPayload, ROUTING_KEYS } from "@booking-ticket-system/event-contracts";
import { MailerService } from "../mailer/mailer.service";
import { RabbitMqService } from "../rabbitmq/rabbitmq.service";

/**
 * "Mời làm đối tác" email — user-service's PartnerInviteService publishes the
 * already-built link; email only (the invitee has no account yet). A redelivery
 * resends the same link, harmless: it's single-use and expires on its own.
 */
@Injectable()
export class PartnerInviteConsumer implements OnModuleInit {
  constructor(
    private readonly rabbit: RabbitMqService,
    private readonly mailer: MailerService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbit.consume<PartnerInvitedPayload>(
      EXCHANGES.USER,
      "notification-service.partner-invited",
      ROUTING_KEYS.PARTNER_INVITED,
      (envelope) => this.onInvited(envelope),
    );
  }

  private async onInvited(envelope: EventEnvelope<PartnerInvitedPayload>): Promise<void> {
    const { email, fullName, inviteUrl, expiresAt } = envelope.payload;
    if (new Date(expiresAt) <= new Date()) return; // stale redelivery — the link is already dead
    const days = Math.max(1, Math.round((new Date(expiresAt).getTime() - Date.now()) / 86_400_000));
    const { subject, html } = partnerInviteEmail({ fullName, inviteUrl, validFor: `${days} ngày` });
    await this.mailer.send(email, subject, html);
  }
}
