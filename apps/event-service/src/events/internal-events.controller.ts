import { Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { InternalTokenGuard } from "../common/internal-token.guard";
import { EventsService } from "./events.service";

/** Called by notification-service's event-reminder cron only — see EventReminderService's doc comment. */
@Controller("internal/events")
@UseGuards(InternalTokenGuard)
export class InternalEventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get("needing-reminder")
  needingReminder(@Query("hoursBefore") hoursBefore?: string, @Query("bandHours") bandHours?: string) {
    return this.eventsService.findNeedingReminder(Number(hoursBefore) || 24, Number(bandHours) || 1);
  }

  @Post(":id/mark-reminder-sent")
  markReminderSent(@Param("id") id: string) {
    return this.eventsService.markReminderSent(id);
  }
}
