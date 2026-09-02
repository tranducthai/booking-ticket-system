import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
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
    const ticketBlocks = await Promise.all(
      tickets.map(async (ticket, i) => {
        const cid = `qr-${ticket.ticketId}`;
        const png = await QRCode.toBuffer(ticket.qrPayload, { width: 300, margin: 1 });
        attachments.push({ filename: `ticket-${i + 1}.png`, content: png, cid });
        return `<div style="margin:24px 0;padding:16px;border:1px solid #ddd;border-radius:8px">
          <p>Ticket ${i + 1} — <code>${ticket.ticketId}</code></p>
          <img src="cid:${cid}" alt="QR code for ticket ${i + 1}" width="220" height="220" />
        </div>`;
      }),
    );

    await this.mailer.send(
      user.email,
      `Your e-tickets are ready — order ${orderId.slice(0, 8)}`,
      `<p>Hi ${escapeHtml(user.fullName)},</p>
       <p>Here ${tickets.length === 1 ? "is your e-ticket" : `are your ${tickets.length} e-tickets`} for order <strong>${orderId}</strong>. Show the QR code at check-in.</p>
       ${ticketBlocks.join("")}`,
      attachments,
    );
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
