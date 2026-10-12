import { timingSafeEqual } from "crypto";
import type { NextFunction, Request, Response } from "express";

function matches(presented: unknown, expected: string): boolean {
  if (typeof presented !== "string") return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Registered first in main.ts. X-User-Id / X-User-Role are only trusted
 * when the request proves it came from the api-gateway (X-Gateway-Token)
 * or from a sibling service forwarding a user's identity (X-Internal-Token)
 * — both carry INTERNAL_TOKEN. Otherwise they're stripped before any guard,
 * decorator or activity log reads them, so calling this service directly
 * (every service has a public URL on Render) can't impersonate anyone.
 *
 * INTERNAL_TOKEN is mandatory in production; empty is tolerated only for
 * local dev, where the gateway still strips client-forged headers.
 * Same shape copy-pasted per service, like the auth guards.
 */
export function gatewayIdentityMiddleware(internalToken: string | undefined) {
  if (!internalToken && process.env.NODE_ENV === "production") {
    throw new Error("INTERNAL_TOKEN is not set — refusing to trust X-User-* headers from anyone");
  }
  return function gatewayIdentity(req: Request, _res: Response, next: NextFunction): void {
    if (internalToken) {
      const trusted = matches(req.headers["x-gateway-token"], internalToken) || matches(req.headers["x-internal-token"], internalToken);
      if (!trusted) {
        delete req.headers["x-user-id"];
        delete req.headers["x-user-role"];
      }
    }
    next();
  };
}
