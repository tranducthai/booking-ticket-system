import { NextFunction, Request, Response } from "express";

/**
 * Paths that exist on every backend service but must never be reachable
 * from the Internet through the gateway:
 *  - `/<svc>/internal/...` — service-to-service routes (auto-refund, seat
 *    release, refund lock, user lookup...). Their InternalTokenGuard is a
 *    second layer, not the only one.
 *  - `/<svc>/metrics` — Prometheus scrape target, scraped inside the network.
 *  - `/<svc>/docs*` — Swagger, which also documents the internal routes.
 *
 * Matched on a normalized path (percent-decoded, repeated slashes
 * collapsed, case-folded) so `/payment//internal` or `/payment/%69nternal`
 * can't slip past a literal prefix check. Answers 404, not 403: there is
 * nothing here as far as a client is concerned.
 */
export function edgeGuardMiddleware(req: Request, res: Response, next: NextFunction): void {
  let path: string;
  try {
    path = decodeURIComponent(req.path);
  } catch {
    res.status(400).json({ statusCode: 400, message: "Malformed path" });
    return;
  }
  const segments = path.toLowerCase().split("/").filter(Boolean);
  const blocked = segments.includes("internal") || segments[1] === "metrics" || segments[1]?.startsWith("docs");
  if (blocked) {
    res.status(404).json({ statusCode: 404, message: "Not Found" });
    return;
  }
  next();
}
