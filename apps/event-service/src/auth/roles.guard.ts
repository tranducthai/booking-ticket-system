import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Role } from "./role";
import { ROLES_KEY } from "./roles.decorator";

/** Pair with RequireAuthGuard — this only checks the role header, it assumes X-User-Id is already validated. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const role = request.headers["x-user-role"];
    if (!role || !requiredRoles.includes(role)) {
      throw new ForbiddenException("Insufficient role for this action");
    }
    return true;
  }
}
