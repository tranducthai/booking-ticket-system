import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { OrderStatus } from "../generated/prisma";
import { MetricsService } from "../metrics/metrics.service";
import { HoldsReleaseService } from "../orders/holds-release.service";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Roadmap Phase 4: "sweep expired holds that never got a payment attempt at
 * all". The Redis TTL in event-service already self-expires the seat lock
 * (SeatLockService), but Seat.status only flips back to AVAILABLE when
 * something calls /internal/seats/:id/release — nothing does that on its
 * own once the TTL lapses. This sweeper is that "something" for Orders that
 * were simply abandoned (no PaymentFailed ever arrives for those, since no
 * payment attempt was ever made).
 *
 * Skips paymentInProgress orders even past expiresAt — orders.service.ts
 * startPayment() extends the underlying Redis hold the moment a real
 * payment attempt begins, so this sweeper yanking the DB-side hold out
 * from under an in-flight payment would be a race, not a cleanup.
 */
@Injectable()
export class HoldsSweeperService {
  private readonly logger = new Logger(HoldsSweeperService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
    private readonly holdsRelease: HoldsReleaseService,
    private readonly metrics: MetricsService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async sweep(): Promise<void> {
    const expired = await this.prisma.order.findMany({
      // Plus EXPIRED rows left by older versions, which no longer exist as a state: an expired order is simply deleted.
      where: { OR: [{ status: OrderStatus.PENDING_PAYMENT, expiresAt: { lt: new Date() } }, { status: OrderStatus.EXPIRED }] },
      include: { items: true },
      take: 100, // bounded batch per tick — a very large backlog drains over a few ticks rather than one huge sweep
    });
    if (expired.length === 0) return;

    this.logger.log(`Sweeping ${expired.length} expired hold(s)`);
    for (const order of expired) {
      try {
        await this.holdsRelease.releaseOnce(order);
        // Nothing is kept of an unpaid order that ran out of time: its pending tickets go with it.
        await this.prisma.$transaction([
          this.prisma.orderItem.deleteMany({ where: { orderId: order.id } }),
          this.prisma.order.delete({ where: { id: order.id } }),
        ]);
        this.metrics.ordersExpiredTotal.inc({ source: "sweep" });
        await this.activity.record({
          action: "order.expired",
          targetType: "order",
          targetId: order.id,
          eventId: order.eventId,
          subjectUserId: order.userId,
          summary: `Đơn #${order.id.slice(0, 8)} hết thời gian giữ chỗ — đã xóa`,
        });
      } catch (err) {
        // Left PENDING_PAYMENT — picked up again next tick rather than silently dropped.
        this.logger.error(`Failed to sweep order ${order.id}: ${(err as Error).message}`);
      }
    }
  }
}
