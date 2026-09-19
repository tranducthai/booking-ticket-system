import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ticketIssuedEmail } from "@booking-ticket-system/email-templates";
import { EventEnvelope, EXCHANGES, ROUTING_KEYS, TicketIssuedPayload } from "@booking-ticket-system/event-contracts";
import * as QRCode from "qrcode";
import { Attachment, MailerService } from "../mailer/mailer.service";
import { RabbitMqService } from "../rabbitmq/rabbitmq.service";
import { UserServiceClient } from "../user-client/user-service.client";

/** docs/spec/09-event-contracts.md catalog: TicketIssued -> the actual e-ticket email, QR attached. */
@Injectable()
export class TicketIssuedConsumer implements OnModuleInit {
  private readonly logger = new Logger(TicketIssuedConsumer.name);

  constructor(
    private readonly rabbit: RabbitMqService,
    private readonly userClient: UserServiceClient,
    private readonly mailer: MailerService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbit.consume<TicketIssuedPayload>(
      EXCHANGES.TICKET,
      "notification-service.ticket-issued",
      ROUTING_KEYS.TICKET_ISSUED,
      (envelope) => this.onTicketIssued(envelope),
    );
  }

  private async onTicketIssued(envelope: EventEnvelope<TicketIssuedPayload>): Promise<void> {
    const { orderId, userId, tickets } = envelope.payload;
    const user = await this.userClient.findById(userId);
    if (!user) {
      this.logger.warn(`Could not resolve user ${userId} for order ${orderId} — skipping e-ticket email`);
      return;
    }

    const attachments: Attachment[] = [];
    const templateTickets = await Promise.all(
      tickets.map(async (ticket, i) => {
        const cid = `qr-${ticket.ticketId}`;
        const png = await QRCode.toBuffer(ticket.qrPayload, { width: 300, margin: 1 });
        attachments.push({ filename: `ticket-${i + 1}.png`, content: png, cid });
        return { ticketId: ticket.ticketId, cid };
      }),
    );

    const { subject, html } = ticketIssuedEmail({ orderId, fullName: user.fullName, tickets: templateTickets });
    await this.mailer.send(user.email, subject, html, attachments);
  }
}
