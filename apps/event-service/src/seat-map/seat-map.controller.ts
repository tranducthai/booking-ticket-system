import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentActor } from "../auth/current-actor.decorator";
import { RequireAuthGuard } from "../auth/require-auth.guard";
import { Role } from "../auth/role";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CreateSeatMapDto } from "./dto/create-seat-map.dto";
import { SeatMapService } from "./seat-map.service";

@Controller()
export class SeatMapController {
  constructor(private readonly seatMapService: SeatMapService) {}

  @Post("events/:eventId/seat-map")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER)
  createOrReplace(
    @Param("eventId") eventId: string,
    @CurrentActor() actor: { userId: string },
    @Body() dto: CreateSeatMapDto,
  ) {
    return this.seatMapService.createOrReplace(eventId, actor.userId, dto);
  }

  @Get("events/:eventId/seat-map")
  get(@Param("eventId") eventId: string) {
    return this.seatMapService.getSeatMap(eventId);
  }

  @Patch("seats/:id/block")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER)
  block(@Param("id") id: string, @CurrentActor() actor: { userId: string }) {
    return this.seatMapService.blockSeat(id, actor.userId);
  }
}
