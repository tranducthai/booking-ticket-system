import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export interface Actor {
  userId: string | null;
  role: string | null;
}

/**
 * Reads the identity the Gateway already verified and forwarded as
 * X-User-Id / X-User-Role — this service does not verify JWTs itself for
 * plain HTTP requests. See docs/spec/08-api-contracts.md "Auth" convention.
 * (The Socket.io gateway is the one exception — see inbox/inbox.gateway.ts's
 * doc comment for why it verifies the JWT itself.)
 */
export const CurrentActor = createParamDecorator((_data: unknown, ctx: ExecutionContext): Actor => {
  const request = ctx.switchToHttp().getRequest();
  const userId = request.headers["x-user-id"] ?? null;
  const role = request.headers["x-user-role"] ?? null;
  return { userId, role };
});
