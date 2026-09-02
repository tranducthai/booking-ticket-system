import { SetMetadata } from "@nestjs/common";
import { Role } from "./role";

export const ROLES_KEY = "roles";

/** Use with RolesGuard: @Roles(Role.ORGANIZER) — pair with @UseGuards(RequireAuthGuard, RolesGuard). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
