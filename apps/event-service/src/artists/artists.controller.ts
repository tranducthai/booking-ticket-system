import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { RequireAuthGuard } from "../auth/require-auth.guard";
import { Role } from "../auth/role";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { ArtistsService } from "./artists.service";
import { CreateArtistDto } from "./dto/create-artist.dto";
import { ListArtistsDto } from "./dto/list-artists.dto";
import { UpdateArtistDto } from "./dto/update-artist.dto";
import { LogActivity } from "../activity-log/log-activity.decorator";

@Controller("artists")
export class ArtistsController {
  constructor(private readonly artistsService: ArtistsService) {}

  /** Public — the homepage "Nghệ sĩ nổi bật" carousel/directory (?verified=true) and the organizer's lineup picker (unfiltered, ?q=name). */
  @Get()
  search(@Query() query: ListArtistsDto) {
    return this.artistsService.search(query);
  }

  /** Public — an artist's own page, upcoming shows included. */
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.artistsService.findById(id);
  }

  @Post()
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @LogActivity({ action: "artist.created", targetType: "artist", summary: ({ result }) => `Tạo nghệ sĩ "${result.name}"` })
  create(@Body() dto: CreateArtistDto) {
    return this.artistsService.create(dto);
  }

  @Patch(":id")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ADMIN) // shared catalog: an organizer editing an artist would edit it for every other organizer's lineup too
  @LogActivity({ action: "artist.updated", targetType: "artist", bodyFields: true, summary: ({ result }) => `Cập nhật nghệ sĩ "${result.name}"` })
  update(@Param("id") id: string, @Body() dto: UpdateArtistDto) {
    return this.artistsService.update(id, dto);
  }

  @Patch(":id/verify")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @LogActivity({ action: "artist.verified", targetType: "artist", summary: ({ result }) => `Xác minh nghệ sĩ "${result.name}"` })
  verify(@Param("id") id: string) {
    return this.artistsService.verify(id, true);
  }

  @Patch(":id/unverify")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @LogActivity({ action: "artist.unverified", targetType: "artist", summary: ({ result }) => `Bỏ xác minh nghệ sĩ "${result.name}"` })
  unverify(@Param("id") id: string) {
    return this.artistsService.verify(id, false);
  }
}
