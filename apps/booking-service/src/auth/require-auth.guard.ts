import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";

/**
 * Requires X-User-Id to be present — set by the Gateway once it verifies the
 * caller's JWT (see docs/spec/08-api-contracts.md). A request reaching this
 * service directly (bypassing the Gateway) without that header is rejected
 * the same way an unauthenticated request would be.
 */
@Injectable()
export class RequireAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (!request.headers["x-user-id"]) {
      throw new UnauthorizedException("Missing authentication context");
    }
    return true;
  }
}
