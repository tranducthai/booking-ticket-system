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

  /**
   * Public half of the Ed25519 ticket-signing key, for offline gate
   * scanners (docs/spec/13-refund-and-anti-fraud-design.md §3.1). Must be
   * registered before "tickets/:id".
   */
  @Get("tickets/signing-keys")
  signingKeys() {
    return this.ticketsService.signingKeys();
  }

  @Get("tickets/:id")
  @UseGuards(RequireAuthGuard)
  findOne(@Param("id") id: string, @CurrentActor() actor: Actor) {
    return this.ticketsService.findOwned(id, actor.userId!);
  }

  @Post("tickets/:id/reissue-qr")
  @UseGuards(RequireAuthGuard)
  reissue(@Param("id") id: string, @CurrentActor() actor: Actor) {
    return this.ticketsService.reissueOwn(id, actor.userId!);
  }

  /**
   * "Check-in staff" isn't a separate role in the 3-role system
   * (docs/spec/01-business-analysis.md §2) — organizers perform check-in
   * themselves or hand a logged-in staff account an ORGANIZER-scoped token.
   * Scoped by event in the path so the gate can only admit tickets of the
   * event it is working (docs/spec/13 §3.3).
   */
  @Post("events/:eventId/check-in")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER, Role.ADMIN)
  checkIn(@Param("eventId") eventId: string, @CurrentActor() actor: Actor, @Body() dto: CheckInDto) {
    return this.ticketsService.checkIn(eventId, dto.code, actor);
  }

  @Get("events/:id/attendees")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER, Role.ADMIN)
  attendees(@Param("id") id: string, @CurrentActor() actor: Actor) {
    return this.ticketsService.attendees(id, actor);
  }

  /** Incident response — bulk-reissue every live QR of an event (docs/spec/13 §3.4). */
  @Post("events/:id/tickets/reissue-qr")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  reissueForEvent(@Param("id") id: string) {
    return this.ticketsService.reissueForEvent(id);
  }
}
