import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { IsIn, IsOptional } from "class-validator";
import { LogActivity } from "../activity-log/log-activity.decorator";
import { Actor, CurrentActor } from "../auth/current-actor.decorator";
import { RequireAuthGuard } from "../auth/require-auth.guard";
import { Role } from "../auth/role";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { UpsertMembershipPlanDto } from "./dto/upsert-plan.dto";
import { MembershipFilter, MembershipsService } from "./memberships.service";

class ListMineDto {
  @IsOptional()
  @IsIn(["active", "expired", "canceled"])
  status?: MembershipFilter;
}

@Controller()
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  /** "Thẻ thành viên của tôi" — Đang hoạt động / Đã hết hạn / Đã hủy. */
  @Get("memberships/mine")
  @UseGuards(RequireAuthGuard)
  mine(@CurrentActor() actor: Actor, @Query() query: ListMineDto) {
    return this.memberships.listMine(actor.userId!, query.status);
  }

  @Post("memberships/:id/cancel")
  @UseGuards(RequireAuthGuard)
  cancel(@Param("id") id: string, @CurrentActor() actor: Actor) {
    return this.memberships.cancel(id, actor.userId!);
  }

  /** Public (the viewer's own card is included when signed in) — the event page's member-benefits box. */
  @Get("events/:id/member-benefits")
  eventBenefits(@Param("id") id: string, @CurrentActor() actor: Actor) {
    return this.memberships.eventBenefits(id, actor.userId);
  }

  @Put("artists/:id/membership-plan")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @LogActivity({ action: "artist.membership_plan_saved", targetType: "artist", targetId: ({ req }) => String(req.params.id), bodyFields: true, summary: ({ result }) => `Cập nhật thẻ thành viên "${result.name}"` })
  upsertPlan(@Param("id") artistId: string, @Body() dto: UpsertMembershipPlanDto) {
    return this.memberships.upsertPlan(artistId, dto);
  }
}
