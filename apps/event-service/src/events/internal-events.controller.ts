import { Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { InternalTokenGuard } from "../common/internal-token.guard";
import { EventsService } from "./events.service";

/**
 * needing-reminder/mark-reminder-sent: notification-service's event-reminder
 * cron (see EventReminderService's doc comment). :id/refund-context:
 * payment-service's refund quote (docs/spec/13-refund-and-anti-fraud-design.md §2).
 */
@Controller("internal/events")
@UseGuards(InternalTokenGuard)
export class InternalEventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get(":id/refund-context")
  refundContext(@Param("id") id: string) {
    return this.eventsService.findForRefund(id);
  }

  @Get("needing-reminder")
  needingReminder(@Query("hoursBefore") hoursBefore?: string, @Query("bandHours") bandHours?: string) {
    return this.eventsService.findNeedingReminder(Number(hoursBefore) || 24, Number(bandHours) || 1);
  }

  @Post(":id/mark-reminder-sent")
  markReminderSent(@Param("id") id: string) {
    return this.eventsService.markReminderSent(id);
  }

  /**
   * Registered LAST — ":id" would otherwise swallow "needing-reminder".
   * Same body as the public GET /events/:id, minus its visibility rule —
   * booking-service (hold gating, organizer stats) and ticket-service
   * (ownership checks) must see drafts too.
   */
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.eventsService.findByIdCached(id);
  }
}
