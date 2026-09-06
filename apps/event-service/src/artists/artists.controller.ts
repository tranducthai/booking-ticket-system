import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { RequireAuthGuard } from "../auth/require-auth.guard";
import { Role } from "../auth/role";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { ArtistsService } from "./artists.service";
import { CreateArtistDto } from "./dto/create-artist.dto";
import { ListArtistsDto } from "./dto/list-artists.dto";
import { UpdateArtistDto } from "./dto/update-artist.dto";

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
  create(@Body() dto: CreateArtistDto) {
    return this.artistsService.create(dto);
  }

  @Patch(":id")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER, Role.ADMIN)
  update(@Param("id") id: string, @Body() dto: UpdateArtistDto) {
    return this.artistsService.update(id, dto);
  }

  @Patch(":id/verify")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  verify(@Param("id") id: string) {
    return this.artistsService.verify(id, true);
  }

  @Patch(":id/unverify")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  unverify(@Param("id") id: string) {
    return this.artistsService.verify(id, false);
  }
}
