import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { orderPaidEmail } from "@booking-ticket-system/email-templates";
import { EventEnvelope, EXCHANGES, OrderPaidPayload, ROUTING_KEYS } from "@booking-ticket-system/event-contracts";
import { NotificationType } from "../generated/prisma";
import { InboxService } from "../inbox/inbox.service";
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
    private readonly inbox: InboxService,
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

    const { subject, html } = orderPaidEmail({ orderId, fullName: user.fullName });
    await this.mailer.send(user.email, subject, html);

    await this.inbox.create({
      userId,
      type: NotificationType.ORDER_PAID,
      title: "Thanh toán thành công",
      body: `Đơn hàng #${orderId.slice(0, 8)} đã thanh toán. Vé điện tử sẽ có ngay sau đây.`,
      data: { orderId },
    });
  }
}
