import { ConfigService } from "@nestjs/config";
import { RedisService } from "../redis/redis.service";
import { SeatLockService } from "./seat-lock.service";

/**
 * Integration test against a REAL Redis (docker compose `redis` service, or
 * REDIS_URL) — the property under test (atomicity of SET ... NX under
 * concurrency) is exactly the thing a mock can't prove. This is the P3-10
 * "race 2 holds on 1 seat" check from docs/spec/11-implementation-roadmap.md.
 */
describe("SeatLockService (real Redis, concurrency)", () => {
  let redis: RedisService;
  let seatLock: SeatLockService;
  const seatId = `test-seat-${Date.now()}`;

  beforeAll(() => {
    const config = {
      get: () => process.env.REDIS_URL ?? "redis://localhost:6379",
    } as unknown as ConfigService;
    redis = new RedisService(config);
    seatLock = new SeatLockService(redis);
  });

  afterEach(async () => {
    await redis.del(`seat:hold:${seatId}`);
  });

  afterAll(() => {
    redis.disconnect();
  });

  it("lets exactly one of two simultaneous holds on the same seat win", async () => {
    const [a, b] = await Promise.all([
      seatLock.tryAcquire(seatId, "order-a", 10),
      seatLock.tryAcquire(seatId, "order-b", 10),
    ]);

    const winners = [a, b].filter(Boolean);
    expect(winners).toHaveLength(1);

    const holder = await seatLock.getHolder(seatId);
    expect(["order-a", "order-b"]).toContain(holder);
  });

  it("does not let a second hold through while the first is still active", async () => {
    expect(await seatLock.tryAcquire(seatId, "order-a", 10)).toBe(true);
    expect(await seatLock.tryAcquire(seatId, "order-b", 10)).toBe(false);
  });

  it("lets a new hold succeed once the previous one is released", async () => {
    expect(await seatLock.tryAcquire(seatId, "order-a", 10)).toBe(true);
    await seatLock.forceRelease(seatId);
    expect(await seatLock.tryAcquire(seatId, "order-b", 10)).toBe(true);
    expect(await seatLock.getHolder(seatId)).toBe("order-b");
  });

  it("releaseIfOwner only releases the hold when the caller actually owns it", async () => {
    expect(await seatLock.tryAcquire(seatId, "order-a", 10)).toBe(true);
    expect(await seatLock.releaseIfOwner(seatId, "order-b")).toBe(false); // not the owner — no-op
    expect(await seatLock.getHolder(seatId)).toBe("order-a");
    expect(await seatLock.releaseIfOwner(seatId, "order-a")).toBe(true); // actual owner — releases
    expect(await seatLock.getHolder(seatId)).toBeNull();
  });

  it("tryAcquireAll is all-or-nothing across a batch of seats", async () => {
    const seatIds = [seatId, `${seatId}-2`, `${seatId}-3`];
    expect(await seatLock.tryAcquire(seatIds[1], "order-x", 10)).toBe(true); // pre-take the middle seat

    const result = await seatLock.tryAcquireAll(seatIds, "order-a", 10);
    expect(result).toBe(false);
    // The first seat must have been rolled back, not left dangling.
    expect(await seatLock.getHolder(seatIds[0])).toBeNull();

    await redis.del(`seat:hold:${seatIds[1]}`, `seat:hold:${seatIds[2]}`);
  });
});
