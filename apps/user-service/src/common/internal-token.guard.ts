import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * docs/spec/12-resilience-and-failure-design.md "X-Internal-Token guard (or
 * mTLS) on all /internal/* routes" — these endpoints have no per-request
 * auth today (docs/spec/08-api-contracts.md just says "only called
 * service-to-service on the internal overlay network"), which is fine as
 * long as the network truly is private, but a shared-secret header is a
 * cheap second layer that doesn't depend on network topology being right.
 */
@Injectable()
export class InternalTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>("INTERNAL_TOKEN");
    if (!expected) return true; // no token configured (e.g. local dev) — don't lock developers out
    const request = context.switchToHttp().getRequest();
    if (request.headers["x-internal-token"] !== expected) {
      throw new UnauthorizedException("Missing or invalid X-Internal-Token");
    }
    return true;
  }
}
