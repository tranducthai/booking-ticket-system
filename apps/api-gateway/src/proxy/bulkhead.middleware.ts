import { NextFunction, Request, Response } from "express";

/**
 * docs/spec/12-resilience-and-failure-design.md "api-gateway: per-downstream
 * connection pool / concurrency budget (bulkhead) + 503+Retry-After
 * load-shed past the budget" — the piece rate-limit.middleware.ts's general
 * per-IP limiter doesn't cover: a slow/struggling ONE downstream (say,
 * Payment Service under load) shouldn't be able to exhaust resources that
 * requests to the other four healthy services also need. Each prefix gets
 * its own concurrency counter; a request in flight to /booking never
 * competes with the budget for /event.
 */
export function createBulkheadMiddleware(prefix: string, maxConcurrent: number) {
  let inFlight = 0;
  return function bulkhead(req: Request, res: Response, next: NextFunction): void {
    if (inFlight >= maxConcurrent) {
      res.set("Retry-After", "1");
      res.status(503).json({
        statusCode: 503,
        message: `Too many concurrent requests to ${prefix} — please retry shortly`,
        error: "ServiceUnavailable",
      });
      return;
    }
    inFlight++;
    let released = false;
    const release = () => {
      if (released) return; // finish and close can both fire for the same request — decrement exactly once
      released = true;
      inFlight--;
    };
    res.on("finish", release);
    res.on("close", release); // client disconnected before a response was ever sent
    next();
  };
}
