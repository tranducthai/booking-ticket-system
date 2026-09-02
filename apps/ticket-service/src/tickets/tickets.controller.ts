import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Actor, CurrentActor } from "../auth/current-actor.decorator";
import { RequireAuthGuard } from "../auth/require-auth.guard";
import { Role } from "../auth/role";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CheckInDto } from "./dto/check-in.dto";
import { ListMineDto } from "./dto/list-mine.dto";
import { TicketsService } from "./tickets.service";

@Controller()
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get("tickets/mine")
  @UseGuards(RequireAuthGuard)
  listMine(@CurrentActor() actor: Actor, @Query() query: ListMineDto) {
    return this.ticketsService.listMine(actor.userId!, query);
  }

  @Get("tickets/:id")
  @UseGuards(RequireAuthGuard)
  findOne(@Param("id") id: string, @CurrentActor() actor: Actor) {
    return this.ticketsService.findOwned(id, actor.userId!);
  }

  /**
   * "Check-in staff" isn't a separate role in the 3-role system
   * (docs/spec/01-business-analysis.md §2) — organizers perform check-in
   * themselves or hand a logged-in staff account an ORGANIZER-scoped token.
   */
  @Post("tickets/:id/check-in")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER, Role.ADMIN)
  checkIn(@Param("id") id: string, @CurrentActor() actor: Actor, @Body() dto: CheckInDto) {
    return this.ticketsService.checkIn(id, dto.qrPayload, actor.userId!);
  }

  @Get("events/:id/attendees")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER, Role.ADMIN)
  attendees(@Param("id") id: string, @CurrentActor() actor: Actor) {
    return this.ticketsService.attendees(id, actor);
  }
}
