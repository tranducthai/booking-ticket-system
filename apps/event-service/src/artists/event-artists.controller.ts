import { Body, Controller, Delete, Param, Post, UseGuards } from "@nestjs/common";
import { IsUUID } from "class-validator";
import { CurrentActor } from "../auth/current-actor.decorator";
import { RequireAuthGuard } from "../auth/require-auth.guard";
import { Role } from "../auth/role";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { ArtistsService } from "./artists.service";
import { LogActivity } from "../activity-log/log-activity.decorator";

class AttachArtistDto {
  @IsUUID()
  artistId!: string;
}

/** Lineup management — separate from ArtistsController since these two routes are event-scoped and owner-checked, same split as ticket-types/seat-map/discount-codes elsewhere in this service. */
@Controller("events/:eventId/artists")
@UseGuards(RequireAuthGuard, RolesGuard)
@Roles(Role.ORGANIZER)
export class EventArtistsController {
  constructor(private readonly artistsService: ArtistsService) {}

  @Post()
  @LogActivity({ action: "lineup.artist_added", targetType: "artist", targetId: ({ result }) => result.artistId, summary: ({ result }) => `Thêm nghệ sĩ "${result.artist?.name}" vào lineup` })
  attach(@Param("eventId") eventId: string, @CurrentActor() actor: { userId: string }, @Body() dto: AttachArtistDto) {
    return this.artistsService.attachToEvent(eventId, dto.artistId, actor.userId);
  }

  @Delete(":artistId")
  @LogActivity({ action: "lineup.artist_removed", targetType: "artist", targetId: ({ req }) => String(req.params.artistId), summary: () => "Gỡ nghệ sĩ khỏi lineup" })
  detach(@Param("eventId") eventId: string, @Param("artistId") artistId: string, @CurrentActor() actor: { userId: string }) {
    return this.artistsService.detachFromEvent(eventId, artistId, actor.userId);
  }
}
