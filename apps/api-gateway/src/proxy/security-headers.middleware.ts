import { NextFunction, Request, Response } from "express";

/**
 * The handful of helmet-style headers that matter for a JSON API + redirect
 * edge (no HTML is ever served from here). Set before proxying; a
 * downstream that sets the same header itself wins.
 */
export function createSecurityHeadersMiddleware(production: boolean) {
  return function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    // OAuth callback URLs carry the provider's authorization code — never leak it onward via Referer.
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    if (production) res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    next();
  };
}
