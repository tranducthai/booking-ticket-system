import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { SessionChecker } from "./session-store";

interface AccessTokenPayload {
  sub: string;
  role: string;
  sid: string;
}

/** Identity headers only this middleware may set — anything the client sent under these names is discarded. */
const TRUSTED_HEADERS = ["x-user-id", "x-user-role", "x-gateway-token", "x-internal-token"] as const;

/** `code` lets apps/web tell "log in again" apart from "you were signed in somewhere else". */
const REVOKED: Record<string, { code: string; message: string }> = {
  replaced: { code: "SESSION_REPLACED", message: "Tài khoản của bạn vừa đăng nhập ở thiết bị khác — phiên này đã bị đăng xuất." },
};

function unauthorized(res: Response, code: string, message: string): void {
  res.status(401).json({ statusCode: 401, message, error: "Unauthorized", code });
}

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
 * A valid signature isn't enough: the token's session (`sid`) must still be
 * active in the session store — that's what makes logout, a login on
 * another device (one session per account) and an admin lock cut off an
 * access token immediately instead of after its 15-minute TTL. If the store
 * can't be reached the request fails closed (503), never "let it through
 * unchecked".
 *
 * A MISSING token passes through as anonymous — public routes (login,
 * register, event search...) don't require one, and the target service
 * enforces its own guard for routes that do. An INVALID/expired/revoked
 * token fails loudly with 401 here rather than silently proxying an
 * unauthenticated request through as if it were anonymous.
 */
export function createJwtContextMiddleware(accessSecret: string, gatewayToken: string | undefined, sessions: SessionChecker) {
  if (!accessSecret) {
    throw new Error("JWT_ACCESS_SECRET is not set — refusing to start the gateway");
  }
  return async function jwtContextMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    for (const name of TRUSTED_HEADERS) delete req.headers[name];
    if (gatewayToken) req.headers["x-gateway-token"] = gatewayToken;

    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      next();
      return;
    }

    let payload: AccessTokenPayload;
    try {
      // Pinned: never let the token's own header pick the algorithm.
      payload = jwt.verify(header.slice("Bearer ".length), accessSecret, { algorithms: ["HS256"] }) as AccessTokenPayload;
      if (typeof payload.sub !== "string" || typeof payload.role !== "string" || typeof payload.sid !== "string") {
        throw new Error("malformed payload");
      }
    } catch {
      unauthorized(res, "TOKEN_INVALID", "Invalid or expired access token");
      return;
    }

    let status;
    try {
      status = await sessions.status(payload.sid);
    } catch {
      res.status(503).json({ statusCode: 503, message: "Không kiểm tra được phiên đăng nhập — vui lòng thử lại.", error: "ServiceUnavailable" });
      return;
    }
    if (!status.active) {
      const revoked = REVOKED[status.reason ?? ""];
      if (revoked) unauthorized(res, revoked.code, revoked.message);
      else unauthorized(res, "SESSION_REVOKED", "Phiên đăng nhập đã kết thúc — vui lòng đăng nhập lại.");
      return;
    }

    req.headers["x-user-id"] = payload.sub;
    req.headers["x-user-role"] = payload.role;
    next();
  };
}
