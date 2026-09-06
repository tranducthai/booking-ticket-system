import { Controller, Get, Query } from "@nestjs/common";
import { UsersService } from "./users.service";

/**
 * Separate from UsersController on purpose — that one carries a class-level
 * JwtAuthGuard, and this route (the homepage's "Featured Stars" carousel and
 * its "see all" page) needs to be reachable by anyone, logged in or not.
 */
@Controller("users")
export class PublicUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("organizers")
  organizers(@Query("page") page?: string, @Query("limit") limit?: string) {
    return this.usersService.listVerifiedOrganizers(Number(page) || 1, Number(limit) || 12);
  }
}
