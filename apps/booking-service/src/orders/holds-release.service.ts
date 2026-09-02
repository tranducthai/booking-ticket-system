import { Injectable, Logger } from "@nestjs/common";
import { Order, OrderItem } from "../generated/prisma";
import { EventServiceClient } from "../event-client/event-service.client";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Centralizes the "release every item's hold back to Event Service" logic
 * so the three places that can trigger it — customer cancel
 * (orders.service.ts), PaymentFailed (sagas/payment-events.consumer.ts),
 * and the expired-hold sweep (holds-sweeper.service.ts) — can't double-fire
 * it for the same order. The guarded UPDATE on Order.holdReleased is the
 * actual idempotency mechanism (docs/spec/12-resilience-and-failure-design.md
 * "make releaseTicketType idempotent, track reservationReleased on the
 * order") — whichever caller wins the race does the releasing; the other
 * sees 0 rows affected and does nothing.
 */
@Injectable()
export class HoldsReleaseService {
  private readonly logger = new Logger(HoldsReleaseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventClient: EventServiceClient,
  ) {}

  /** Returns true if this call actually performed the release (false if some other caller already had). */
  async releaseOnce(order: Order & { items: OrderItem[] }): Promise<boolean> {
    const claimed = await this.prisma.order.updateMany({
      where: { id: order.id, holdReleased: false },
      data: { holdReleased: true },
    });
    if (claimed.count === 0) {
      this.logger.log(`Order ${order.id} holds already released — skipping`);
      return false;
    }

    for (const item of order.items) {
      try {
        if (item.seatId) {
          await this.eventClient.releaseSeat(item.seatId, order.id, order.userId);
        } else if (item.ticketTypeId) {
          await this.eventClient.releaseTicketType(item.ticketTypeId, item.quantity);
        }
      } catch (err) {
        // Logged, not rethrown — holdReleased is already true so this won't
        // be retried automatically; a stuck Redis hold still self-expires
        // via its TTL, and event-service's StaleHoldSweeper reconciles
        // Postgres Seat.status independently of this call succeeding.
        this.logger.error(`Failed to release item ${item.id} of order ${order.id}: ${(err as Error).message}`);
      }
    }
    return true;
  }
}
