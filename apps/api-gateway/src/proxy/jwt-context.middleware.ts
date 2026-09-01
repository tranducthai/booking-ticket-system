import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

interface AccessTokenPayload {
  sub: string;
  role: string;
}

/**
 * Verifies the Bearer access token (if any) and forwards the decoded
 * identity to downstream services as trusted headers — see
 * docs/spec/08-api-contracts.md "Auth" convention: services trust
 * X-User-Id/X-User-Role from the gateway and don't re-verify the JWT
 * themselves.
 *
 * A MISSING token passes through untouched — public routes (login,
 * register, event search...) don't require one, and the target service
 * enforces its own guard for routes that do. An INVALID/expired token
 * fails loudly with 401 here rather than silently proxying an
 * unauthenticated request through as if it were anonymous.
 */
export function createJwtContextMiddleware(accessSecret: string) {
  return function jwtContextMiddleware(req: Request, res: Response, next: NextFunction): void {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      next();
      return;
    }

    const token = header.slice("Bearer ".length);
    try {
      const payload = jwt.verify(token, accessSecret) as AccessTokenPayload;
      req.headers["x-user-id"] = payload.sub;
      req.headers["x-user-role"] = payload.role;
      next();
    } catch {
      res.status(401).json({ statusCode: 401, message: "Invalid or expired access token" });
    }
  };
}
