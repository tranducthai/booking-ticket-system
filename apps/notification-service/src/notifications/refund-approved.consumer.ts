import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventEnvelope, EXCHANGES, RefundApprovedPayload, ROUTING_KEYS } from "@booking-ticket-system/event-contracts";
import { formatVnd } from "../common/format-vnd";
import { NotificationType } from "../generated/prisma";
import { InboxService } from "../inbox/inbox.service";
import { RabbitMqService } from "../rabbitmq/rabbitmq.service";

/**
 * payment-service publishes this from both the customer-requested refund
 * flow (refunds.service.ts's approve()) and the compensating auto-refund
 * saga (payments.service.ts's autoRefund()). Only the former carries a real
 * userId — the auto-refund path has no authenticated actor to attribute it
 * to, so `userId` is optional on the payload and this consumer just skips
 * the in-app notification (not the refund itself) when it's missing.
 */
@Injectable()
export class RefundApprovedConsumer implements OnModuleInit {
  private readonly logger = new Logger(RefundApprovedConsumer.name);

  constructor(
    private readonly rabbit: RabbitMqService,
    private readonly inbox: InboxService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbit.consume<RefundApprovedPayload>(
      EXCHANGES.PAYMENT,
      "notification-service.refund-approved",
      ROUTING_KEYS.REFUND_APPROVED,
      (envelope) => this.onRefundApproved(envelope),
    );
  }

  private async onRefundApproved(envelope: EventEnvelope<RefundApprovedPayload>): Promise<void> {
    const { refundId, orderId, amount, userId } = envelope.payload;
    if (!userId) {
      this.logger.log(`Refund ${refundId} on order ${orderId} has no requesting user — skipping in-app notification`);
      return;
    }
    await this.inbox.create({
      userId,
      type: NotificationType.REFUND_APPROVED,
      title: "Hoàn tiền thành công",
      body: `Đơn hàng #${orderId.slice(0, 8)} đã được hoàn ${formatVnd(amount)}.`,
      data: { orderId, refundId },
    });
  }
}
