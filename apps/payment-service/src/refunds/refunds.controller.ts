import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type { RefundReasonCategory } from "@booking-ticket-system/event-contracts";
import { Actor, CurrentActor } from "../auth/current-actor.decorator";
import { RequireAuthGuard } from "../auth/require-auth.guard";
import { Role } from "../auth/role";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { ListMyRefundsDto, ListRefundsDto } from "./dto/list-refunds.dto";
import { RequestRefundDto } from "./dto/request-refund.dto";
import { ApproveRefundDto, QuoteRefundDto, RefundMessageDto } from "./dto/review-refund.dto";
import { RefundsService } from "./refunds.service";

/** docs/spec/08-api-contracts.md §4 + docs/spec/13-refund-and-anti-fraud-design.md §2.2. */
@Controller("refunds")
export class RefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  @Post()
  @UseGuards(RequireAuthGuard)
  request(@CurrentActor() actor: Actor, @Body() dto: RequestRefundDto) {
    return this.refundsService.request(actor, dto);
  }

  /** Static routes before ":id". */
  @Get("quote")
  @UseGuards(RequireAuthGuard)
  quote(@CurrentActor() actor: Actor, @Query() query: QuoteRefundDto) {
    return this.refundsService.quote(actor, query.orderId, query.reasonCategory as RefundReasonCategory | undefined, query.orderItemIds);
  }

  @Get("mine")
  @UseGuards(RequireAuthGuard)
  listMine(@CurrentActor() actor: Actor, @Query() query: ListMyRefundsDto) {
    return this.refundsService.listMine(actor, query);
  }

  @Get()
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER, Role.ADMIN)
  list(@CurrentActor() actor: Actor, @Query() query: ListRefundsDto) {
    return this.refundsService.list(actor, query);
  }

  @Get(":id")
  @UseGuards(RequireAuthGuard)
  get(@Param("id") id: string, @CurrentActor() actor: Actor) {
    return this.refundsService.get(id, actor);
  }

  @Patch(":id/approve")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER, Role.ADMIN)
  approve(@Param("id") id: string, @CurrentActor() actor: Actor, @Body() dto: ApproveRefundDto) {
    return this.refundsService.approve(id, actor, dto);
  }

  @Patch(":id/reject")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER, Role.ADMIN)
  reject(@Param("id") id: string, @CurrentActor() actor: Actor, @Body() dto: RefundMessageDto) {
    return this.refundsService.reject(id, actor, dto.message);
  }

  @Patch(":id/need-info")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER, Role.ADMIN)
  requestInfo(@Param("id") id: string, @CurrentActor() actor: Actor, @Body() dto: RefundMessageDto) {
    return this.refundsService.requestInfo(id, actor, dto.message);
  }

  @Patch(":id/retry")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  retry(@Param("id") id: string, @CurrentActor() actor: Actor) {
    return this.refundsService.retry(id, actor);
  }

  @Patch(":id/mark-transferred")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  markTransferred(@Param("id") id: string, @CurrentActor() actor: Actor) {
    return this.refundsService.markTransferred(id, actor);
  }

  @Post(":id/respond")
  @UseGuards(RequireAuthGuard)
  respond(@Param("id") id: string, @CurrentActor() actor: Actor, @Body() dto: RefundMessageDto) {
    return this.refundsService.respond(id, actor, dto.message);
  }

  @Post(":id/withdraw")
  @UseGuards(RequireAuthGuard)
  withdraw(@Param("id") id: string, @CurrentActor() actor: Actor) {
    return this.refundsService.withdraw(id, actor);
  }

  @Post(":id/escalate")
  @UseGuards(RequireAuthGuard)
  escalate(@Param("id") id: string, @CurrentActor() actor: Actor, @Body() dto: RefundMessageDto) {
    return this.refundsService.escalate(id, actor, dto.message);
  }
}
