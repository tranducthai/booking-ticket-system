import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";
import { LogActivity } from "../activity-log/log-activity.decorator";
import { Actor, CurrentActor } from "../auth/current-actor.decorator";
import { RequireAuthGuard } from "../auth/require-auth.guard";
import { ArtistPageService } from "./artist-page.service";
import { CreateArtistPostDto } from "./dto/create-artist-post.dto";

class PageDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

/** Follow + posts on an artist's page. Reads are public; the viewer's identity (when signed in) unlocks members-only posts. */
@Controller("artists/:id")
export class ArtistPageController {
  constructor(private readonly page: ArtistPageService) {}

  @Get("viewer")
  viewer(@Param("id") id: string, @CurrentActor() actor: Actor) {
    return this.page.viewerState(id, actor);
  }

  @Post("follow")
  @UseGuards(RequireAuthGuard)
  follow(@Param("id") id: string, @CurrentActor() actor: Actor) {
    return this.page.follow(id, actor.userId!);
  }

  @Delete("follow")
  @UseGuards(RequireAuthGuard)
  unfollow(@Param("id") id: string, @CurrentActor() actor: Actor) {
    return this.page.unfollow(id, actor.userId!);
  }

  @Get("posts")
  posts(@Param("id") id: string, @CurrentActor() actor: Actor, @Query() q: PageDto) {
    return this.page.listPosts(id, actor, q.page, q.limit);
  }

  @Post("posts")
  @UseGuards(RequireAuthGuard)
  @LogActivity({ action: "artist.post_created", targetType: "artist", targetId: ({ req }) => String(req.params.id), summary: () => "Đăng bài trên trang nghệ sĩ" })
  createPost(@Param("id") id: string, @CurrentActor() actor: Actor, @Body() dto: CreateArtistPostDto) {
    return this.page.createPost(id, actor, dto);
  }

  @Delete("posts/:postId")
  @UseGuards(RequireAuthGuard)
  deletePost(@Param("id") id: string, @Param("postId") postId: string, @CurrentActor() actor: Actor) {
    return this.page.deletePost(id, postId, actor);
  }
}
