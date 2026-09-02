/**
 * docs/spec/12-resilience-and-failure-design.md "cache stampede guard:
 * single-flight lock-on-miss" — when N concurrent requests all miss the
 * same cache key at once (the exact flash-sale moment this matters:
 * everyone's first GET /events/:id for a just-opened sale), only the first
 * actually queries Postgres; the rest await that same in-flight promise
 * instead of each firing their own identical query.
 *
 * Per-process only (a Map, not Redis) — good enough for this project's
 * single-instance-per-service demo target; a multi-replica deployment
 * would need this coordinated via a Redis lock instead (same idea, shared
 * across processes).
 */
export class SingleFlight {
  private readonly inFlight = new Map<string, Promise<unknown>>();

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<T>;

    const promise = fn().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }
}
