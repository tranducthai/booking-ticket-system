import { Body, Controller, Delete, Param, Post, UseGuards } from "@nestjs/common";
import { LogActivity } from "../activity-log/log-activity.decorator";
import { CurrentActor } from "../auth/current-actor.decorator";
import { RequireAuthGuard } from "../auth/require-auth.guard";
import { Role } from "../auth/role";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CreateShowtimesDto } from "./dto/create-showtimes.dto";
import { ShowtimesService } from "./showtimes.service";

/** Showtimes are read as part of GET /events/:id; these routes only change them. */
@Controller()
@UseGuards(RequireAuthGuard, RolesGuard)
@Roles(Role.ORGANIZER, Role.ADMIN)
export class ShowtimesController {
  constructor(private readonly showtimes: ShowtimesService) {}

  @Post("events/:eventId/showtimes")
  @LogActivity({ action: "showtime.created", targetType: "event", summary: ({ result }) => `Thêm ${result.length} suất diễn` })
  create(@Param("eventId") eventId: string, @CurrentActor() actor: { userId: string; role: Role }, @Body() dto: CreateShowtimesDto) {
    return this.showtimes.create(eventId, actor, dto);
  }

  @Delete("showtimes/:id")
  @LogActivity({ action: "showtime.deleted", targetType: "showtime", summary: () => "Xóa một suất diễn" })
  remove(@Param("id") id: string, @CurrentActor() actor: { userId: string; role: Role }) {
    return this.showtimes.remove(id, actor);
  }
}
