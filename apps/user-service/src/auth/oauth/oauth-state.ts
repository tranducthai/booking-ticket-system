import { randomBytes, timingSafeEqual } from "crypto";
import type { Request, Response } from "express";

const COOKIE = "tb_oauth_state";
const MAX_AGE_MS = 10 * 60_000;

/**
 * OAuth `state` (login-CSRF protection): a random value sent to the provider
 * AND pinned to this browser in an HttpOnly cookie; the callback is only
 * honored when the two match. Without it, an attacker could make a victim's
 * browser complete the attacker's own Google login and silently sign the
 * victim into the attacker's account.
 *
 * Both legs (/auth/<provider> and its callback) go through the same
 * api-gateway host, so the cookie set on the first comes back on the second.
 * SameSite=Lax is what lets it ride along on the provider's top-level
 * redirect back. Bound to the provider, so a Google state can't complete a
 * Facebook callback.
 */
export function issueOAuthState(res: Response, provider: string, secure: boolean): string {
  const state = randomBytes(24).toString("hex");
  res.cookie(COOKIE, `${provider}.${state}`, { httpOnly: true, sameSite: "lax", secure, maxAge: MAX_AGE_MS, path: "/" });
  return state;
}

/** Single use: the cookie is cleared whether or not it matched. */
export function consumeOAuthState(req: Request, res: Response, provider: string, presented: unknown, secure: boolean): boolean {
  const stored = readCookie(req, COOKIE);
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: "lax", secure, path: "/" });
  if (!stored || typeof presented !== "string" || !presented) return false;
  const a = Buffer.from(stored);
  const b = Buffer.from(`${provider}.${presented}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

// No cookie-parser in this service — this is the only cookie it ever reads.
function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}
