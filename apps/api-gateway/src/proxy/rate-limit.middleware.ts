import { NextFunction, Request, Response } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Minimal in-memory fixed-window limiter — no Redis dependency for the
 * gateway (keeping it the one stateless edge process). docs/spec/12-resilience-and-failure-design.md
 * "per-downstream connection pool / concurrency budget (bulkhead) +
 * 503+Retry-After load-shed" and docs/spec/11-implementation-roadmap.md
 * Phase 8b "strict limit on /user/auth/login (e.g. 5/min/IP...)".
 *
 * In-memory means limits are per-gateway-replica, not cluster-wide — fine
 * for the single-node demo this project targets (docs/spec/04-deployment-design.md
 * "Docker Swarm... single node"); a multi-replica production gateway would
 * need this backed by Redis instead (same idea, shared counters).
 */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Returns true if the request should be allowed. */
  tryConsume(key: string): { allowed: boolean; retryAfterSeconds: number } {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (bucket.count >= this.limit) {
      return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
    }
    bucket.count++;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  /** Called on a periodic timer so the map doesn't grow forever with one-shot visitors. */
  sweep(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

function clientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}

/**
 * General per-IP budget across the whole gateway — the bulkhead half of
 * this: past this, an IP is shed with 503 rather than let through to keep
 * piling load onto downstream services that are already struggling.
 */
export function createGeneralRateLimitMiddleware(limit = 300, windowMs = 60_000) {
  const limiter = new RateLimiter(limit, windowMs);
  setInterval(() => limiter.sweep(), windowMs).unref();
  return function generalRateLimit(req: Request, res: Response, next: NextFunction): void {
    const { allowed, retryAfterSeconds } = limiter.tryConsume(clientIp(req));
    if (!allowed) {
      res.set("Retry-After", String(retryAfterSeconds));
      res.status(503).json({ statusCode: 503, message: "Too many requests — please slow down", error: "ServiceUnavailable" });
      return;
    }
    next();
  };
}

/**
 * Strict limit on the login route specifically (docs/spec/04-deployment-design.md
 * §2a auth-burst design: "per-IP (5/minute)... to block credential-stuffing").
 * Keyed by IP + path so it only ever throttles login attempts, never
 * unrelated traffic from the same visitor.
 */
export function createLoginRateLimitMiddleware(limit = 5, windowMs = 60_000) {
  const limiter = new RateLimiter(limit, windowMs);
  setInterval(() => limiter.sweep(), windowMs).unref();
  return function loginRateLimit(req: Request, res: Response, next: NextFunction): void {
    if (req.method !== "POST" || !req.path.endsWith("/auth/login")) {
      next();
      return;
    }
    const { allowed, retryAfterSeconds } = limiter.tryConsume(clientIp(req));
    if (!allowed) {
      res.set("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        statusCode: 429,
        message: "Too many login attempts — please wait before trying again",
        error: "TooManyRequests",
      });
      return;
    }
    next();
  };
}
