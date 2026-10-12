import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

interface AccessTokenPayload {
  sub: string;
  role: string;
}

/** Identity headers only this middleware may set — anything the client sent under these names is discarded. */
const TRUSTED_HEADERS = ["x-user-id", "x-user-role", "x-gateway-token", "x-internal-token"] as const;

/**
 * Verifies the Bearer access token (if any) and forwards the decoded
 * identity to downstream services as trusted headers — see
 * docs/spec/08-api-contracts.md "Auth" convention: services trust
 * X-User-Id/X-User-Role from the gateway and don't re-verify the JWT
 * themselves.
 *
 * Client-supplied copies of those headers are ALWAYS stripped first.
 * Before this, a request with no Authorization header was proxied with
 * whatever X-User-Id / X-User-Role the client chose — `X-User-Role: ADMIN`
 * was enough to act as an admin on every service but user-service.
 *
 * When `gatewayToken` (INTERNAL_TOKEN) is set it's attached as
 * X-Gateway-Token: services only honor X-User-* that arrive with it, so
 * calling a service directly (Render gives every service a public URL)
 * can't forge identity either — see each service's
 * common/gateway-identity.middleware.ts.
 *
 * A MISSING token passes through as anonymous — public routes (login,
 * register, event search...) don't require one, and the target service
 * enforces its own guard for routes that do. An INVALID/expired token
 * fails loudly with 401 here rather than silently proxying an
 * unauthenticated request through as if it were anonymous.
 */
export function createJwtContextMiddleware(accessSecret: string, gatewayToken?: string) {
  if (!accessSecret) {
    throw new Error("JWT_ACCESS_SECRET is not set — refusing to start the gateway");
  }
  return function jwtContextMiddleware(req: Request, res: Response, next: NextFunction): void {
    for (const name of TRUSTED_HEADERS) delete req.headers[name];
    if (gatewayToken) req.headers["x-gateway-token"] = gatewayToken;

    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      next();
      return;
    }

    const token = header.slice("Bearer ".length);
    try {
      // Pinned: never let the token's own header pick the algorithm.
      const payload = jwt.verify(token, accessSecret, { algorithms: ["HS256"] }) as AccessTokenPayload;
      if (typeof payload.sub !== "string" || typeof payload.role !== "string") {
        throw new Error("malformed payload");
      }
      req.headers["x-user-id"] = payload.sub;
      req.headers["x-user-role"] = payload.role;
      next();
    } catch {
      res.status(401).json({ statusCode: 401, message: "Invalid or expired access token" });
    }
  };
}
