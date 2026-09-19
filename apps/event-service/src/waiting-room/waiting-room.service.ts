import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Interval } from "@nestjs/schedule";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";

const ADMITTED_TTL_SECONDS = 600; // matches the seat-hold window — once admitted, roughly one hold cycle to finish checkout
const RELEASE_LOCK_TTL_MS = 4000; // < the 5000ms tick interval, so it always expires before the next tick fires — no unlock needed, see release()

function queueKey(eventId: string): string {
  return `waiting-room:queue:${eventId}`;
}
function admittedKey(eventId: string, sessionId: string): string {
  return `waiting-room:admitted:${eventId}:${sessionId}`;
}
function highDemandEventsKey(): string {
  return "waiting-room:high-demand-events"; // set of eventIds the release worker should tick — maintained by the guard on first sight, trimmed when an event stops being high_demand (see events.service.ts if that toggle exists) or just ages out naturally as traffic stops
}
function releaseLockKey(): string {
  return "waiting-room:release-lock"; // mutual-exclusion so only one event-service replica runs a tick's admissions — see release()
}

export interface WaitingRoomStatus {
  admitted: boolean;
  position?: number; // 1-based
  queueLength?: number;
}

/**
 * docs/spec/11-implementation-roadmap.md Phase 8b "waiting-room middleware
 * that gates the event-page routes" + docs/spec/04-deployment-design.md §2
 * overload guards. Simplified relative to the full design (no CAPTCHA, no
 * sticky-session enforcement beyond "the caller supplies the same
 * sessionId each time", no adaptive rate driven by Booking p99/DB pool —
 * that would mean this service reaching into booking-service's internals)
 * — the core mechanism (FIFO queue, bounded admission, position/ETA visible
 * to the caller) is real and Redis-backed, not a stub. Two gaps flagged in
 * docs/spec/12-resilience-and-failure-design.md §2.10 ARE closed here: a
 * per-tick release lock (multiple replicas won't double-admit) and
 * capacity-aware batch sizing (never admits more people than there's
 * actual inventory left to sell them) — see release() below.
 */
@Injectable()
export class WaitingRoomService {
  private readonly logger = new Logger(WaitingRoomService.name);
  private readonly releaseBatchSize: number;
  private readonly maxQueueMultiplier: number;

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.releaseBatchSize = Number(config.get<string>("WAITING_ROOM_RELEASE_BATCH") ?? 50);
    this.maxQueueMultiplier = Number(config.get<string>("WAITING_ROOM_MAX_QUEUE_MULTIPLIER") ?? 5);
  }

  async isAdmitted(eventId: string, sessionId: string): Promise<boolean> {
    const exists = await this.redis.exists(admittedKey(eventId, sessionId));
    return exists === 1;
  }

  /**
   * Joins the queue if not already in it or admitted. `capacityHint` (e.g.
   * remaining ticket count) bounds queue length — docs/spec/04-deployment-design.md
   * §2 "giới hạn độ dài hàng đợi ở mức ~3x tồn kho còn lại": past that, new
   * joins are rejected outright rather than handed a hopeless position.
   */
  async join(eventId: string, sessionId: string, capacityHint?: number): Promise<WaitingRoomStatus | { rejected: true }> {
    if (await this.isAdmitted(eventId, sessionId)) return { admitted: true };

    const queueLength = await this.redis.zcard(queueKey(eventId));
    if (capacityHint && capacityHint > 0) {
      const maxQueue = capacityHint * this.maxQueueMultiplier;
      if (queueLength >= maxQueue) return { rejected: true };
    }

    await this.redis.zadd(queueKey(eventId), "NX", Date.now(), sessionId);
    await this.redis.sadd(highDemandEventsKey(), eventId);
    return this.status(eventId, sessionId);
  }

  async status(eventId: string, sessionId: string): Promise<WaitingRoomStatus> {
    if (await this.isAdmitted(eventId, sessionId)) return { admitted: true };

    const rank = await this.redis.zrank(queueKey(eventId), sessionId);
    if (rank === null) return { admitted: false, position: undefined, queueLength: await this.redis.zcard(queueKey(eventId)) };
    return { admitted: false, position: rank + 1, queueLength: await this.redis.zcard(queueKey(eventId)) };
  }

  /**
   * The release worker.
   *
   * Singleton via a per-tick lock (docs/spec/12-resilience-and-failure-design.md
   * "waiting room release worker as a singleton"): every replica's timer
   * fires independently every 5s, but only the one that wins the
   * `SET NX PX` race this tick actually admits anyone — the rest see the
   * lock held and skip. The lock's 4s TTL is shorter than the 5s tick
   * interval, so it always expires on its own before the next tick; no
   * explicit unlock (and no risk of one replica unlocking another's lock)
   * needed. With a single replica this is a no-op (always wins instantly),
   * so it doesn't change local/demo behavior — it just stops being wrong
   * the moment a second replica exists.
   *
   * Batch size is capped by real remaining inventory (availableCapacity())
   * so a sold-out event stops admitting people into a hopeless checkout —
   * the "adaptive" part docs/spec/04-deployment-design.md asks for, scoped
   * to a signal this service actually owns (its own ticket/seat counts)
   * rather than reaching into booking-service's DB pool/ack-lag.
   */
  @Interval(5000)
  async release(): Promise<void> {
    const lockToken = randomUUID();
    const gotLock = await this.redis.set(releaseLockKey(), lockToken, "PX", RELEASE_LOCK_TTL_MS, "NX");
    if (gotLock !== "OK") return; // another replica is running this tick

    const eventIds = await this.redis.smembers(highDemandEventsKey());
    for (const eventId of eventIds) {
      const queueLen = await this.redis.zcard(queueKey(eventId));
      if (queueLen === 0) {
        await this.redis.srem(highDemandEventsKey(), eventId); // nothing left to tick for this event
        continue;
      }

      const capacity = await this.availableCapacity(eventId);
      const batchSize = capacity === null ? this.releaseBatchSize : Math.min(this.releaseBatchSize, capacity);
      if (batchSize <= 0) continue; // sold out — hold the queue rather than admit into a checkout with nothing left

      const batch = await this.redis.zrange(queueKey(eventId), 0, batchSize - 1);
      if (batch.length === 0) continue;

      const pipeline = this.redis.pipeline();
      for (const sessionId of batch) {
        pipeline.set(admittedKey(eventId, sessionId), "1", "EX", ADMITTED_TTL_SECONDS);
        pipeline.zrem(queueKey(eventId), sessionId);
      }
      await pipeline.exec();
      this.logger.log(`Admitted ${batch.length} for event ${eventId} (${queueLen - batch.length} still queued)`);
    }
  }

  /** Remaining sellable inventory for an event — GA ticket types' unsold count, or unbooked seats for a seat map. Null if the event doesn't exist (racing a delete); the caller then falls back to the fixed batch size. */
  private async availableCapacity(eventId: string): Promise<number | null> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        ticketMode: true,
        ticketTypes: { select: { quantityTotal: true, quantitySold: true } },
        seatMap: { select: { zones: { select: { seats: { select: { status: true } } } } } },
      },
    });
    if (!event) return null;

    if (event.ticketMode === "SEATMAP") {
      if (!event.seatMap) return 0;
      return event.seatMap.zones.reduce((sum, zone) => sum + zone.seats.filter((s) => s.status === "AVAILABLE").length, 0);
    }
    return event.ticketTypes.reduce((sum, tt) => sum + Math.max(0, tt.quantityTotal - tt.quantitySold), 0);
  }
}
