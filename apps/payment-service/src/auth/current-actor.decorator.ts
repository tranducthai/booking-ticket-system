import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { Role } from "./role";

export interface Actor {
  userId: string | null;
  role: Role | null;
}

export const CurrentActor = createParamDecorator((_data: unknown, ctx: ExecutionContext): Actor => {
  const request = ctx.switchToHttp().getRequest();
  const userId = request.headers["x-user-id"] ?? null;
  const role = (request.headers["x-user-role"] as Role) ?? null;
  return { userId, role };
});
