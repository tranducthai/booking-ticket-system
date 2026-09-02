import { Injectable } from "@nestjs/common";
import { seatHoldKey } from "../common/redis-keys";
import { RedisService } from "../redis/redis.service";

// GET-then-DEL as one atomic op — the only way to "release/confirm my own
// hold" without a lost-update race between the check and the delete.
const RELEASE_IF_OWNER = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`;

// Multi-seat atomic acquire (docs/spec/12-resilience-and-failure-design.md
// "atomic multi-seat hold"): SETNX every key in one round trip, and if ANY
// of them is already taken, undo whichever ones this call itself just
// acquired — never leave a partial multi-seat hold sitting in Redis for
// the sweeper to have to clean up later.
const ACQUIRE_ALL_OR_NOTHING = `
local acquired = {}
for i, key in ipairs(KEYS) do
  if redis.call("SET", key, ARGV[1], "EX", ARGV[2], "NX") then
    table.insert(acquired, key)
  else
    for _, k in ipairs(acquired) do redis.call("DEL", k) end
    return 0
  end
end
return 1
`;

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

  /** All-or-nothing acquire for a batch of seats — see ACQUIRE_ALL_OR_NOTHING above. */
  async tryAcquireAll(seatIds: string[], orderId: string, ttlSeconds: number): Promise<boolean> {
    if (seatIds.length === 0) return true;
    const keys = seatIds.map(seatHoldKey);
    const result = await this.redis.eval(ACQUIRE_ALL_OR_NOTHING, keys.length, ...keys, orderId, ttlSeconds);
    return result === 1;
  }

  /**
   * Ownership-checked release/confirm (docs/spec/12-resilience-and-failure-design.md
   * "confirmSeat/releaseSeat via a Redis Lua script"). Returns false when the
   * hold doesn't exist (already expired/released — treat as already-done,
   * not an error) or is owned by a DIFFERENT order (never let order A
   * release/steal-confirm order B's hold).
   */
  async releaseIfOwner(seatId: string, orderId: string): Promise<boolean> {
    const result = await this.redis.eval(RELEASE_IF_OWNER, 1, seatHoldKey(seatId), orderId);
    return result === 1;
  }

  /** Non-owning force-release — only for the StaleHoldSweeper reconciling a hold Postgres thinks is stale. */
  async forceRelease(seatId: string): Promise<void> {
    await this.redis.del(seatHoldKey(seatId));
  }

  async getHolder(seatId: string): Promise<string | null> {
    return this.redis.get(seatHoldKey(seatId));
  }

  /** Resets a hold's TTL without changing its owner — used by extend-hold when payment starts. */
  async extend(seatId: string, orderId: string, ttlSeconds: number): Promise<boolean> {
    const holder = await this.getHolder(seatId);
    if (holder !== orderId) return false;
    await this.redis.expire(seatHoldKey(seatId), ttlSeconds);
    return true;
  }
}
