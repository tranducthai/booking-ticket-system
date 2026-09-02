import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventEnvelope, EXCHANGES, OrderPaidPayload, ROUTING_KEYS } from "@booking-ticket-system/event-contracts";
import { MailerService } from "../mailer/mailer.service";
import { RabbitMqService } from "../rabbitmq/rabbitmq.service";
import { UserServiceClient } from "../user-client/user-service.client";

/**
 * docs/spec/09-event-contracts.md catalog: "OrderPaid ... Notification
 * sends an order-confirmed note" — a lightweight "we're generating your
 * tickets" email. The e-ticket itself (with the QR) waits for TicketIssued
 * (ticket-issued.consumer.ts), per this doc's own "design refinement"
 * section: Notification can't attach a QR it doesn't have yet.
 */
@Injectable()
export class OrderPaidConsumer implements OnModuleInit {
  private readonly logger = new Logger(OrderPaidConsumer.name);

  constructor(
    private readonly rabbit: RabbitMqService,
    private readonly userClient: UserServiceClient,
    private readonly mailer: MailerService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbit.consume<OrderPaidPayload>(
      EXCHANGES.BOOKING,
      "notification-service.order-paid",
      ROUTING_KEYS.ORDER_PAID,
      (envelope) => this.onOrderPaid(envelope),
    );
  }

  private async onOrderPaid(envelope: EventEnvelope<OrderPaidPayload>): Promise<void> {
    const { orderId, userId } = envelope.payload;
    const user = await this.userClient.findById(userId);
    if (!user) {
      this.logger.warn(`Could not resolve user ${userId} for order ${orderId} — skipping confirmation email`);
      return;
    }

    await this.mailer.send(
      user.email,
      `We received your payment — order ${orderId.slice(0, 8)}`,
      `<p>Hi ${escapeHtml(user.fullName)},</p>
       <p>Your payment for order <strong>${orderId}</strong> was successful. We're generating your e-tickets now — you'll get another email with your QR codes shortly.</p>`,
    );
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
