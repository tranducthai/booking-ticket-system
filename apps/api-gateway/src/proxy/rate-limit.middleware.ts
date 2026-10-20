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

/**
 * `req.ip`, which Express derives from X-Forwarded-For only as far as the
 * TRUST_PROXY_HOPS setting in main.ts allows. Never the raw header: its
 * first entry is whatever the client typed, so keying limits on it let
 * anyone dodge the login lockout (or lock out someone else) by sending a
 * fresh X-Forwarded-For per request.
 */
export function clientIp(req: Request): string {
  return req.ip ?? req.socket?.remoteAddress ?? "unknown";
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
 * Brute-force guard on the login route: only FAILED attempts count. A
 * client IP gets `maxFailures` wrong passwords (401 from user-service); the
 * next attempt is refused with 429 for `lockoutMs`, counted from the last
 * failure. A successful login clears its counter, so normal use — logging in
 * and out, switching accounts — never trips it.
 *
 * Keyed by IP only: the gateway streams the request body straight through to
 * user-service without parsing it, so it never sees which account was tried.
 */
export class FailedLoginTracker {
  private readonly failures = new Map<string, { count: number; lastAt: number }>();

  constructor(
    private readonly maxFailures: number,
    private readonly lockoutMs: number,
  ) {}

  /** Seconds left on the lockout, or 0 if this key may try again. */
  lockedFor(key: string): number {
    const entry = this.failures.get(key);
    if (!entry) return 0;
    const left = entry.lastAt + this.lockoutMs - Date.now();
    if (left <= 0) {
      this.failures.delete(key); // lockout (or the failure streak) has expired
      return 0;
    }
    return entry.count >= this.maxFailures ? Math.ceil(left / 1000) : 0;
  }

  recordFailure(key: string): void {
    const entry = this.failures.get(key);
    const fresh = !entry || entry.lastAt + this.lockoutMs <= Date.now();
    this.failures.set(key, { count: fresh ? 1 : entry.count + 1, lastAt: Date.now() });
  }

  recordSuccess(key: string): void {
    this.failures.delete(key);
  }

  sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.failures) {
      if (entry.lastAt + this.lockoutMs <= now) this.failures.delete(key);
    }
  }
}

export function createLoginRateLimitMiddleware(maxFailures = 5, lockoutMs = 15 * 60_000) {
  const tracker = new FailedLoginTracker(maxFailures, lockoutMs);
  setInterval(() => tracker.sweep(), 60_000).unref();
  return function loginRateLimit(req: Request, res: Response, next: NextFunction): void {
    if (req.method !== "POST" || !req.path.endsWith("/auth/login")) {
      next();
      return;
    }
    const ip = clientIp(req);
    const retryAfterSeconds = tracker.lockedFor(ip);
    if (retryAfterSeconds > 0) {
      res.set("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        statusCode: 429,
        message: `Bạn đã đăng nhập sai ${maxFailures} lần. Vui lòng thử lại sau ${Math.ceil(retryAfterSeconds / 60)} phút.`,
        error: "TooManyRequests",
      });
      return;
    }
    // The proxy writes user-service's answer onto this same res — judge the attempt by its status.
    res.on("finish", () => {
      if (res.statusCode === 401) tracker.recordFailure(ip);
      else if (res.statusCode >= 200 && res.statusCode < 300) tracker.recordSuccess(ip);
    });
    next();
  };
}
