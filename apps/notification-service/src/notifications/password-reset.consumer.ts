import { Injectable, OnModuleInit } from "@nestjs/common";
import { passwordResetEmail } from "@booking-ticket-system/email-templates";
import { EventEnvelope, EXCHANGES, PasswordResetRequestedPayload, ROUTING_KEYS } from "@booking-ticket-system/event-contracts";
import { MailerService } from "../mailer/mailer.service";
import { RabbitMqService } from "../rabbitmq/rabbitmq.service";

/**
 * "Quên mật khẩu" email — user-service's PasswordResetService publishes the
 * already-built link; email only, no in-app notification (the user isn't
 * logged in). A redelivery resends the same link, harmless: it's single-use
 * and expires on its own.
 */
@Injectable()
export class PasswordResetConsumer implements OnModuleInit {
  constructor(
    private readonly rabbit: RabbitMqService,
    private readonly mailer: MailerService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbit.consume<PasswordResetRequestedPayload>(
      EXCHANGES.USER,
      "notification-service.password-reset-requested",
      ROUTING_KEYS.PASSWORD_RESET_REQUESTED,
      (envelope) => this.onRequested(envelope),
    );
  }

  private async onRequested(envelope: EventEnvelope<PasswordResetRequestedPayload>): Promise<void> {
    const { email, fullName, resetUrl, expiresAt } = envelope.payload;
    if (new Date(expiresAt) <= new Date()) return; // stale redelivery — the link is already dead
    const minutes = Math.max(1, Math.round((new Date(expiresAt).getTime() - Date.now()) / 60_000));
    const { subject, html } = passwordResetEmail({ fullName, resetUrl, validFor: `${minutes} phút` });
    await this.mailer.send(email, subject, html);
  }
}
