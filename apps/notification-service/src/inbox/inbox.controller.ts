import { Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { Actor, CurrentActor } from "../auth/current-actor.decorator";
import { RequireAuthGuard } from "../auth/require-auth.guard";
import { ListNotificationsDto } from "./dto/list-notifications.dto";
import { InboxService } from "./inbox.service";

@Controller("notifications")
@UseGuards(RequireAuthGuard)
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get()
  list(@CurrentActor() actor: Actor, @Query() query: ListNotificationsDto) {
    return this.inbox.list(actor.userId!, query);
  }

  @Get("unread-count")
  async unreadCount(@CurrentActor() actor: Actor) {
    return { count: await this.inbox.unreadCount(actor.userId!) };
  }

  @Patch("read-all")
  markAllRead(@CurrentActor() actor: Actor) {
    return this.inbox.markAllRead(actor.userId!);
  }

  @Patch(":id/read")
  markRead(@Param("id") id: string, @CurrentActor() actor: Actor) {
    return this.inbox.markRead(id, actor.userId!);
  }
}
