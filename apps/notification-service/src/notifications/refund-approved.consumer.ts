import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { refundApprovedEmail, refundInfoRequestedEmail, refundRejectedEmail } from "@booking-ticket-system/email-templates";
import {
  EventEnvelope,
  EXCHANGES,
  RefundApprovedPayload,
  RefundInfoRequestedPayload,
  RefundRejectedPayload,
  ROUTING_KEYS,
} from "@booking-ticket-system/event-contracts";
import { formatVnd } from "../common/format-vnd";
import { NotificationType } from "../generated/prisma";
import { InboxService } from "../inbox/inbox.service";
import { MailerService } from "../mailer/mailer.service";
import { RabbitMqService } from "../rabbitmq/rabbitmq.service";
import { UserServiceClient } from "../user-client/user-service.client";
import { frontendUrl } from "./frontend-url";

/**
 * In-app + email updates for the refund workflow (docs/spec/13-refund-and-anti-fraud-design.md §2.2).
 *
 * RefundApproved is published once the money has actually been sent back,
 * by payment-service's RefundProcessorService (customer requests, event
 * cancellations, postponement refunds) and by the compensating auto-refund
 * saga. That last one carries no userId (no authenticated actor to
 * attribute it to), so both the in-app notification and the email are
 * skipped — not the refund itself.
 */
@Injectable()
export class RefundApprovedConsumer implements OnModuleInit {
  private readonly logger = new Logger(RefundApprovedConsumer.name);

  constructor(
    private readonly rabbit: RabbitMqService,
    private readonly inbox: InboxService,
    private readonly userClient: UserServiceClient,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbit.consume<RefundApprovedPayload>(
      EXCHANGES.PAYMENT,
      "notification-service.refund-approved",
      ROUTING_KEYS.REFUND_APPROVED,
      (envelope) => this.onRefundApproved(envelope),
    );
    await this.rabbit.consume<RefundRejectedPayload>(
      EXCHANGES.PAYMENT,
      "notification-service.refund-rejected",
      ROUTING_KEYS.REFUND_REJECTED,
      (envelope) => this.onRefundRejected(envelope),
    );
    await this.rabbit.consume<RefundInfoRequestedPayload>(
      EXCHANGES.PAYMENT,
      "notification-service.refund-info-requested",
      ROUTING_KEYS.REFUND_INFO_REQUESTED,
      (envelope) => this.onInfoRequested(envelope),
    );
  }

  /** Recipient + the links every refund email carries; null when the user can't be resolved. */
  private async recipient(userId: string, orderId: string) {
    const user = await this.userClient.findById(userId);
    if (!user) {
      this.logger.warn(`Could not resolve user ${userId} for order ${orderId} — skipping refund email`);
      return null;
    }
    return {
      email: user.email,
      fullName: user.fullName,
      orderCode: orderId.slice(0, 8),
      orderUrl: `${frontendUrl(this.config)}/don-hang/${orderId}`,
    };
  }

  private async onRefundApproved(envelope: EventEnvelope<RefundApprovedPayload>): Promise<void> {
    const { refundId, orderId, amount, userId, kind, orderItemIds } = envelope.payload;
    const ticketCount = orderItemIds?.length || undefined;
    if (!userId) {
      this.logger.log(`Refund ${refundId} on order ${orderId} has no requesting user — skipping notification`);
      return;
    }
    const why = kind === "EVENT_CANCELED" ? " do sự kiện bị hủy" : kind === "EVENT_POSTPONED" ? " do sự kiện đổi lịch" : "";
    await this.inbox.create({
      userId,
      type: NotificationType.REFUND_APPROVED,
      title: "Hoàn tiền thành công",
      body: `${ticketCount ? `${ticketCount} vé của đơn` : "Đơn hàng"} #${orderId.slice(0, 8)} đã được hoàn ${formatVnd(amount)}${why}. Tiền về tài khoản trong 2–5 ngày làm việc.`,
      data: { orderId, refundId },
    });

    const to = await this.recipient(userId, orderId);
    if (!to) return;
    const { subject, html } = refundApprovedEmail({ ...to, amount: formatVnd(amount), kind: kind ?? "CUSTOMER_REQUEST", ticketCount });
    await this.mailer.send(to.email, subject, html);
  }

  private async onRefundRejected(envelope: EventEnvelope<RefundRejectedPayload>): Promise<void> {
    const { refundId, orderId, userId, reason, final } = envelope.payload;
    await this.inbox.create({
      userId,
      type: NotificationType.REFUND_REJECTED,
      title: final ? "Khiếu nại hoàn tiền bị từ chối" : "Yêu cầu hoàn tiền bị từ chối",
      body: final
        ? `Quản trị viên đã từ chối khiếu nại cho đơn #${orderId.slice(0, 8)}: ${reason}`
        : `Đơn #${orderId.slice(0, 8)}: ${reason}. Vé của bạn vẫn dùng được. Bạn có thể khiếu nại lên quản trị viên trong 7 ngày.`,
      data: { orderId, refundId },
    });

    const to = await this.recipient(userId, orderId);
    if (!to) return;
    const { subject, html } = refundRejectedEmail({ ...to, reason, final: Boolean(final) });
    await this.mailer.send(to.email, subject, html);
  }

  private async onInfoRequested(envelope: EventEnvelope<RefundInfoRequestedPayload>): Promise<void> {
    const { refundId, orderId, userId, message } = envelope.payload;
    await this.inbox.create({
      userId,
      type: NotificationType.REFUND_INFO_REQUESTED,
      title: "Cần bổ sung thông tin hoàn tiền",
      body: `Đơn #${orderId.slice(0, 8)}: ${message}`,
      data: { orderId, refundId },
    });

    const to = await this.recipient(userId, orderId);
    if (!to) return;
    const { subject, html } = refundInfoRequestedEmail({ ...to, message });
    await this.mailer.send(to.email, subject, html);
  }
}
