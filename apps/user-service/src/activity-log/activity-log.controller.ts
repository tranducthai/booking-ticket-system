import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { JwtPayload } from "../auth/interfaces/jwt-payload.interface";
import { ActivityLogService } from "./activity-log.service";
import { ListActivityLogsDto } from "./dto/list-activity-logs.dto";

/**
 * docs/spec/14-activity-log-design.md §4 — same routes as the other
 * services, minus events/:eventId: nothing user-service logs is scoped to
 * an event (the frontend skips this source for the per-event view).
 */
@Controller("activity-logs")
@UseGuards(JwtAuthGuard)
export class ActivityLogController {
  constructor(private readonly activity: ActivityLogService) {}

  @Get("mine")
  mine(@CurrentUser() user: JwtPayload, @Query() query: ListActivityLogsDto) {
    return this.activity.listMine(user.sub, query);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  all(@Query() query: ListActivityLogsDto) {
    return this.activity.listAll(query);
  }
}
