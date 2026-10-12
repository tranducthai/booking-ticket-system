import { AsyncLocalStorage } from "async_hooks";
import type { NextFunction, Request, Response } from "express";

/**
 * Per-request facts ActivityLogService stamps onto every row without each
 * call site having to thread `req` through — docs/spec/14-activity-log-design.md §3.
 * Same shape copy-pasted per service, like the auth decorators.
 */
export interface RequestContext {
  actorId?: string;
  actorRole?: string;
  ip?: string;
  userAgent?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * The gateway proxies with `xfwd: true`, which APPENDS the real peer to
 * X-Forwarded-For — so the last entry is the one the gateway saw; anything
 * before it is client-supplied and spoofable.
 */
function clientIp(req: Request): string | undefined {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded.join(",") : forwarded;
  const last = raw?.split(",").pop()?.trim();
  return (last || req.socket.remoteAddress || undefined)?.slice(0, 64);
}

export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const header = (name: string) => {
    const v = req.headers[name];
    return typeof v === "string" && v ? v : undefined;
  };
  requestContext.run(
    {
      actorId: header("x-user-id"),
      actorRole: header("x-user-role"),
      ip: clientIp(req),
      userAgent: header("user-agent")?.slice(0, 300),
    },
    next,
  );
}
