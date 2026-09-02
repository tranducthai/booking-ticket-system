import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Actor, CurrentActor } from "../auth/current-actor.decorator";
import { RequireAuthGuard } from "../auth/require-auth.guard";
import { Role } from "../auth/role";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { ListRefundsDto } from "./dto/list-refunds.dto";
import { RequestRefundDto } from "./dto/request-refund.dto";
import { RefundsService } from "./refunds.service";

@Controller("refunds")
export class RefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  @Post()
  @UseGuards(RequireAuthGuard)
  request(@CurrentActor() actor: Actor, @Body() dto: RequestRefundDto) {
    return this.refundsService.request(actor, dto);
  }

  @Get()
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER, Role.ADMIN)
  list(@CurrentActor() actor: Actor, @Query() query: ListRefundsDto) {
    return this.refundsService.list(actor, query);
  }

  @Patch(":id/approve")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER, Role.ADMIN)
  approve(@Param("id") id: string, @CurrentActor() actor: Actor) {
    return this.refundsService.approve(id, actor);
  }

  @Patch(":id/reject")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER, Role.ADMIN)
  reject(@Param("id") id: string, @CurrentActor() actor: Actor) {
    return this.refundsService.reject(id, actor);
  }
}
