import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "crypto";

/**
 * docs/spec/12-resilience-and-failure-design.md "X-Internal-Token guard (or
 * mTLS) on all /internal/* routes" — these endpoints have no per-request
 * auth today (docs/spec/08-api-contracts.md just says "only called
 * service-to-service on the internal overlay network"), which is fine as
 * long as the network truly is private, but a shared-secret header is a
 * cheap second layer that doesn't depend on network topology being right.
 *
 * Constant-time comparison (a plain `!==` leaks how many leading characters
 * matched through response timing). With no INTERNAL_TOKEN configured the
 * guard is open only outside production — in production it fails closed.
 * Same shape copy-pasted per service, like the auth guards.
 */
@Injectable()
export class InternalTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>("INTERNAL_TOKEN");
    if (!expected) {
      if (process.env.NODE_ENV === "production") {
        throw new UnauthorizedException("Internal routes are disabled: INTERNAL_TOKEN is not configured");
      }
      return true; // local dev without a token — don't lock developers out
    }
    const presented = context.switchToHttp().getRequest().headers["x-internal-token"];
    const a = Buffer.from(typeof presented === "string" ? presented : "");
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException("Missing or invalid X-Internal-Token");
    }
    return true;
  }
}
