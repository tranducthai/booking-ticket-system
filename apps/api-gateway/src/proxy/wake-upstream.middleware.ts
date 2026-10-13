import { NextFunction, Request, Response } from "express";

/**
 * Free-tier hosts (Render) put a service to sleep after ~15 min without
 * inbound traffic, and a request that reaches it while it's still booting
 * comes back as a 502 from the host — the gateway used to pass that straight
 * to the browser (which then reports it as a CORS error, the 502 page having
 * no CORS headers).
 *
 * So before proxying to a downstream nobody has used for IDLE_MS, the
 * gateway polls its /health/live until it answers (up to WAKE_TIMEOUT_MS),
 * holding the request instead of failing it. It also wakes every OTHER
 * downstream in the background at the same time: a sleeping service isn't
 * woken by RabbitMQ messages, only by HTTP, so without this a paid order
 * would sit in ticket-service's queue until someone happened to open
 * "Vé của tôi" (and services also call each other directly with short
 * timeouts — booking -> event, payment -> booking).
 *
 * Harmless when nothing sleeps (local dev, paid instances): after the first
 * request it's a timestamp comparison.
 */
const IDLE_MS = 10 * 60 * 1000; // comfortably inside the host's 15-min sleep window
const WAKE_TIMEOUT_MS = 90 * 1000;
const POLL_EVERY_MS = 2000;

interface Upstream {
  target: string;
  lastSeenAt: number;
  waking: Promise<void> | null;
}

export class UpstreamWaker {
  private readonly upstreams = new Map<string, Upstream>();

  register(prefix: string, target: string): void {
    this.upstreams.set(prefix, { target: target.replace(/\/+$/, ""), lastSeenAt: 0, waking: null });
  }

  middleware(prefix: string) {
    return async (_req: Request, _res: Response, next: NextFunction): Promise<void> => {
      const upstream = this.upstreams.get(prefix);
      if (upstream && Date.now() - upstream.lastSeenAt > IDLE_MS) {
        for (const [other, u] of this.upstreams) {
          if (other !== prefix && Date.now() - u.lastSeenAt > IDLE_MS) void this.wake(u);
        }
        await this.wake(upstream);
      }
      if (upstream) upstream.lastSeenAt = Date.now();
      next(); // even if waking timed out — the proxy then reports the real error
    };
  }

  /** Single-flight per upstream: concurrent requests share one polling loop. */
  private wake(upstream: Upstream): Promise<void> {
    upstream.waking ??= this.poll(upstream).finally(() => {
      upstream.waking = null;
    });
    return upstream.waking;
  }

  private async poll(upstream: Upstream): Promise<void> {
    const deadline = Date.now() + WAKE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${upstream.target}/health/live`, { signal: AbortSignal.timeout(15_000) });
        if (res.ok) {
          upstream.lastSeenAt = Date.now();
          return;
        }
      } catch {
        // still booting / connection refused — keep polling
      }
      await new Promise((r) => setTimeout(r, POLL_EVERY_MS));
    }
    // eslint-disable-next-line no-console
    console.warn(`[api-gateway] ${upstream.target} did not become healthy within ${WAKE_TIMEOUT_MS / 1000}s`);
  }
}
