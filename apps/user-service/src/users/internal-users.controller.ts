import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { InternalTokenGuard } from "../common/internal-token.guard";
import { UsersService } from "./users.service";

/**
 * Internal-only lookup for other services that only hold a userId (e.g.
 * Notification Service resolving who to email) — see docs/spec/08-api-contracts.md
 * "Internal-only endpoints are not exposed through the API Gateway". Not
 * called out under any single roadmap phase; added alongside Phase 7
 * (Notification Service) since that's the first consumer that needs it.
 * Reuses UsersService.findById, which already excludes passwordHash.
 */
@Controller("internal/users")
@UseGuards(InternalTokenGuard)
export class InternalUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(":id")
  findById(@Param("id") id: string) {
    return this.usersService.findById(id);
  }
}
