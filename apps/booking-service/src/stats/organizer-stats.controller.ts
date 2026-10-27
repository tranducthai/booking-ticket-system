import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { CurrentActor } from "../auth/current-actor.decorator";
import { RequireAuthGuard } from "../auth/require-auth.guard";
import { Role } from "../auth/role";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { OrganizerStatsQueryDto } from "./dto/organizer-stats-query.dto";
import { OrganizerStatsService } from "./organizer-stats.service";

/** Registered before OrdersController (module order) so "orders/organizer-stats" isn't read as "orders/:id". */
@Controller()
export class OrganizerStatsController {
  constructor(private readonly stats: OrganizerStatsService) {}

  @Get("orders/organizer-stats")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER, Role.ADMIN)
  get(@CurrentActor() actor: { userId: string; role: Role }, @Query() query: OrganizerStatsQueryDto) {
    return this.stats.stats(actor, query);
  }
}
