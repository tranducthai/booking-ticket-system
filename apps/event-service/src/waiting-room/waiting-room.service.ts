import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Interval } from "@nestjs/schedule";
import { RedisService } from "../redis/redis.service";

const ADMITTED_TTL_SECONDS = 600; // matches the seat-hold window — once admitted, roughly one hold cycle to finish checkout

function queueKey(eventId: string): string {
  return `waiting-room:queue:${eventId}`;
}
function admittedKey(eventId: string, sessionId: string): string {
  return `waiting-room:admitted:${eventId}:${sessionId}`;
}
function highDemandEventsKey(): string {
  return "waiting-room:high-demand-events"; // set of eventIds the release worker should tick — maintained by the guard on first sight, trimmed when an event stops being high_demand (see events.service.ts if that toggle exists) or just ages out naturally as traffic stops
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
 * sessionId each time", a fixed release batch size rather than an adaptive
 * rate driven by Booking p99/DB pool) — the core mechanism (FIFO queue,
 * bounded admission, position/ETA visible to the caller) is real and
 * Redis-backed, not a stub.
 */
@Injectable()
export class WaitingRoomService {
  private readonly logger = new Logger(WaitingRoomService.name);
  private readonly releaseBatchSize: number;
  private readonly maxQueueMultiplier: number;

  constructor(
    private readonly redis: RedisService,
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
   * The release worker — docs/spec/04-deployment-design.md's "adaptive
   * release rate driven by Booking p99/DB pool/ack-lag" is simplified here
   * to a fixed batch per tick; the doc itself flags that adaptive part as
   * the harder Phase 8c follow-up, not a Phase 8b baseline requirement.
   *
   * Singleton note (docs/spec/12-resilience-and-failure-design.md "waiting
   * room release worker as a singleton"): with a single event-service
   * replica (this project's local/demo target) there's nothing to
   * coordinate. Multiple replicas would double-admit each tick without a
   * leader lock — flagged rather than silently wrong, but not implemented,
   * since faking a lock with no second replica to ever test it against
   * would be unverifiable.
   */
  @Interval(5000)
  async release(): Promise<void> {
    const eventIds = await this.redis.smembers(highDemandEventsKey());
    for (const eventId of eventIds) {
      const queueLen = await this.redis.zcard(queueKey(eventId));
      if (queueLen === 0) {
        await this.redis.srem(highDemandEventsKey(), eventId); // nothing left to tick for this event
        continue;
      }
      const batch = await this.redis.zrange(queueKey(eventId), 0, this.releaseBatchSize - 1);
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
}
