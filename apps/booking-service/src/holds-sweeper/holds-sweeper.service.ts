import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { OrderStatus } from "../generated/prisma";
import { EventServiceClient } from "../event-client/event-service.client";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Roadmap Phase 4: "sweep expired holds that never got a payment attempt at
 * all". The Redis TTL in event-service already self-expires the seat lock
 * (SeatLockService), but Seat.status only flips back to AVAILABLE when
 * something calls /internal/seats/:id/release — nothing does that on its own
 * once the TTL lapses. This sweeper is that "something" for Orders that were
 * simply abandoned (no PaymentFailed ever arrives for those, since no
 * payment attempt was ever made).
 */
@Injectable()
export class HoldsSweeperService {
  private readonly logger = new Logger(HoldsSweeperService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventClient: EventServiceClient,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    const expired = await this.prisma.order.findMany({
      where: { status: OrderStatus.PENDING_PAYMENT, expiresAt: { lt: new Date() } },
      include: { items: true },
      take: 100, // bounded batch per tick — a very large backlog drains over a few ticks rather than one huge sweep
    });
    if (expired.length === 0) return;

    this.logger.log(`Sweeping ${expired.length} expired hold(s)`);
    for (const order of expired) {
      try {
        for (const item of order.items) {
          if (item.seatId) {
            await this.eventClient.releaseSeat(item.seatId);
          } else if (item.ticketTypeId) {
            await this.eventClient.releaseTicketType(item.ticketTypeId, item.quantity);
          }
        }
        await this.prisma.order.update({ where: { id: order.id }, data: { status: OrderStatus.EXPIRED } });
      } catch (err) {
        // Left PENDING_PAYMENT — picked up again next tick rather than silently dropped.
        this.logger.error(`Failed to sweep order ${order.id}: ${(err as Error).message}`);
      }
    }
  }
}
