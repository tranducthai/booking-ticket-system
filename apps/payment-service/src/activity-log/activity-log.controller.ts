import { Controller, ForbiddenException, Get, Param, Query, UseGuards } from "@nestjs/common";
import { Actor, CurrentActor } from "../auth/current-actor.decorator";
import { RequireAuthGuard } from "../auth/require-auth.guard";
import { Role } from "../auth/role";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { EventServiceClient } from "../event-client/event-service.client";
import { ActivityLogService } from "./activity-log.service";
import { ListActivityLogsDto } from "./dto/list-activity-logs.dto";

/** docs/spec/14-activity-log-design.md §4 — identical routes on every service; the frontend merges them. */
@Controller("activity-logs")
@UseGuards(RequireAuthGuard)
export class ActivityLogController {
  constructor(
    private readonly activity: ActivityLogService,
    private readonly events: EventServiceClient,
  ) {}

  @Get("mine")
  mine(@CurrentActor() actor: Actor, @Query() query: ListActivityLogsDto) {
    return this.activity.listMine(actor.userId!, query);
  }

  @Get("events/:eventId")
  @UseGuards(RolesGuard)
  @Roles(Role.ORGANIZER, Role.ADMIN)
  async forEvent(@Param("eventId") eventId: string, @CurrentActor() actor: Actor, @Query() query: ListActivityLogsDto) {
    if (actor.role !== Role.ADMIN) {
      const organizerId = (await this.events.getRefundContext(eventId)).organizerId;
      if (organizerId !== actor.userId) {
        throw new ForbiddenException("You do not own this event");
      }
    }
    return this.activity.listForEvent(eventId, query);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  all(@Query() query: ListActivityLogsDto) {
    return this.activity.listAll(query);
  }
}
