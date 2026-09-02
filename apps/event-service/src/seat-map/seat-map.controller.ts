import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentActor } from "../auth/current-actor.decorator";
import { RequireAuthGuard } from "../auth/require-auth.guard";
import { Role } from "../auth/role";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { WaitingRoomGuard } from "../waiting-room/waiting-room.guard";
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

  /** docs/spec/08-api-contracts.md §2 — immutable structure, CDN + Redis cached. */
  @Get("events/:eventId/seat-map/layout")
  getLayout(@Param("eventId") eventId: string) {
    return this.seatMapService.getLayout(eventId);
  }

  /** docs/spec/08-api-contracts.md §2 — volatile per-seat status, served from the Redis snapshot; poll every 2-3s. */
  @Get("events/:eventId/seat-map/state")
  @UseGuards(WaitingRoomGuard)
  getState(@Param("eventId") eventId: string) {
    return this.seatMapService.getState(eventId);
  }

  @Patch("seats/:id/block")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER)
  block(@Param("id") id: string, @CurrentActor() actor: { userId: string }) {
    return this.seatMapService.blockSeat(id, actor.userId);
  }
}
