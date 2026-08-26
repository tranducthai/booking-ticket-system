import { SetMetadata } from "@nestjs/common";
import { Role } from "@prisma/client";

export const ROLES_KEY = "roles";

/** Use with RolesGuard: @Roles(Role.ADMIN) — leave unset to allow any authenticated role. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
