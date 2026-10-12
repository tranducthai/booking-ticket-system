import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventCanceledPayload, EventEnvelope, EXCHANGES, ROUTING_KEYS } from "@booking-ticket-system/event-contracts";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { OrderStatus } from "../generated/prisma";
import { HoldsReleaseService } from "../orders/holds-release.service";
import { PrismaService } from "../prisma/prisma.service";
import { RabbitMqService } from "../rabbitmq/rabbitmq.service";

/**
 * docs/spec/13-refund-and-anti-fraud-design.md §2.3 — Booking's share of an
 * event cancellation is only the UNPAID orders: release their holds and
 * mark them CANCELED so nobody can finish paying for a dead event. Paid
 * orders are left alone here — payment-service refunds each one and the
 * resulting RefundApproved cancels them through the normal
 * RefundEventsConsumer path. A payment that lands after this ran is caught
 * by PaymentEventsConsumer's CANCELED -> auto-refund branch.
 */
@Injectable()
export class EventCanceledConsumer implements OnModuleInit {
  private readonly logger = new Logger(EventCanceledConsumer.name);

  constructor(
    private readonly rabbit: RabbitMqService,
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
    private readonly holdsRelease: HoldsReleaseService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbit.consume<EventCanceledPayload>(
      EXCHANGES.EVENT,
      "booking-service.event-canceled",
      ROUTING_KEYS.EVENT_CANCELED,
      (envelope) => this.onEventCanceled(envelope),
    );
  }

  private async onEventCanceled(envelope: EventEnvelope<EventCanceledPayload>): Promise<void> {
    try {
      await this.prisma.processedEvent.create({ data: { eventId: envelope.eventId, consumer: "event-canceled" } });
    } catch {
      this.logger.log(`Duplicate delivery of event-canceled eventId=${envelope.eventId} — skipping`);
      return;
    }

    const pending = await this.prisma.order.findMany({
      where: { eventId: envelope.payload.eventId, status: OrderStatus.PENDING_PAYMENT },
      include: { items: true },
    });
    for (const order of pending) {
      await this.holdsRelease.releaseOnce(order).catch((err) => {
        this.logger.warn(`Hold release for order ${order.id} failed: ${(err as Error).message} — StaleHoldSweeper will reconcile`);
      });
      await this.prisma.order.updateMany({
        where: { id: order.id, status: OrderStatus.PENDING_PAYMENT },
        data: { status: OrderStatus.CANCELED, paymentInProgress: false },
      });
      await this.activity.record({
        action: "order.canceled",
        targetType: "order",
        targetId: order.id,
        eventId: order.eventId,
        subjectUserId: order.userId,
        summary: `Đơn #${order.id.slice(0, 8)} chưa thanh toán bị hủy do sự kiện bị hủy`,
      });
    }
    this.logger.log(`Event ${envelope.payload.eventId} canceled — ${pending.length} unpaid order(s) canceled`);
  }
}
