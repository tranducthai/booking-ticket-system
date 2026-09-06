import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { InternalTokenGuard } from "../common/internal-token.guard";
import { TicketsService } from "./tickets.service";

/** Called by notification-service's event-reminder cron only — see that service's doc comment. */
@Controller("internal/tickets")
@UseGuards(InternalTokenGuard)
export class InternalTicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get("by-event/:eventId")
  byEvent(@Param("eventId") eventId: string) {
    return this.ticketsService.attendeeUserIdsForEvent(eventId);
  }
}
