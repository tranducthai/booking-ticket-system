import { Injectable } from "@nestjs/common";
import { seatHoldKey } from "../common/redis-keys";
import { RedisService } from "../redis/redis.service";

/**
 * The actual concurrency-safety mechanism for seat holding (see
 * docs/spec/01-business-analysis.md §5 and docs/spec/10-sequence-diagrams.md).
 * Isolated from HoldsService's Postgres/WebSocket side effects so the
 * atomicity property itself can be tested directly against a real Redis
 * (see seat-lock.service.spec.ts) without needing a database.
 */
@Injectable()
export class SeatLockService {
  constructor(private readonly redis: RedisService) {}

  /** Atomic "acquire only if nobody else holds it" — SET ... NX EX. */
  async tryAcquire(seatId: string, orderId: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.set(seatHoldKey(seatId), orderId, "EX", ttlSeconds, "NX");
    return result === "OK";
  }

  async release(seatId: string): Promise<void> {
    await this.redis.del(seatHoldKey(seatId));
  }

  async getHolder(seatId: string): Promise<string | null> {
    return this.redis.get(seatHoldKey(seatId));
  }
}
