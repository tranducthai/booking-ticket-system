import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { Role } from "./role";

export interface Actor {
  userId: string | null;
  role: Role | null;
}

/**
 * Reads the identity the Gateway already verified and forwarded as
 * X-User-Id / X-User-Role — this service does not verify JWTs itself.
 * See docs/spec/08-api-contracts.md "Auth" convention.
 */
export const CurrentActor = createParamDecorator((_data: unknown, ctx: ExecutionContext): Actor => {
  const request = ctx.switchToHttp().getRequest();
  const userId = request.headers["x-user-id"] ?? null;
  const role = (request.headers["x-user-role"] as Role) ?? null;
  return { userId, role };
});
