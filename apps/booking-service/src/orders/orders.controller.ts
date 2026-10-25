import { Body, Controller, ForbiddenException, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentActor } from "../auth/current-actor.decorator";
import { RequireAuthGuard } from "../auth/require-auth.guard";
import { Role } from "../auth/role";
import { ApplyDiscountDto } from "./dto/apply-discount.dto";
import { GetOrderStatsDto } from "./dto/get-order-stats.dto";
import { ListOrdersDto } from "./dto/list-orders.dto";
import { OrdersService } from "./orders.service";
import { MembershipOrdersService } from "./membership-orders.service";
import { MembershipCheckoutDto } from "./dto/membership-checkout.dto";

@Controller()
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly membershipOrders: MembershipOrdersService,
  ) {}

  /** Buy (or renew) an artist's membership card — returns the order to pay at /thanh-toan, already PAID when the card is free. */
  @Post("memberships/checkout")
  @UseGuards(RequireAuthGuard)
  membershipCheckout(@CurrentActor() actor: { userId: string }, @Body() dto: MembershipCheckoutDto) {
    return this.membershipOrders.checkout(actor.userId, dto.planId);
  }

  /**
   * One path, role-dependent behaviour (docs/spec/08-api-contracts.md §3):
   * customers see their own orders; organizer/admin get the unscoped
   * dashboard view filtered by eventId/status.
   */
  @Get("orders")
  @UseGuards(RequireAuthGuard)
  list(@CurrentActor() actor: { userId: string; role: Role }, @Query() query: ListOrdersDto) {
    if (actor.role === Role.ORGANIZER || actor.role === Role.ADMIN) {
      return this.ordersService.listForDashboard(actor, query);
    }
    return this.ordersService.listMine(actor.userId, query);
  }

  /**
   * Must be registered before "orders/:id" — same reason as similar guards
   * elsewhere in this codebase (event-service's "mine"/"pending" before
   * ":id"). docs/spec/01-business-analysis.md §3.2/§3.3 revenue dashboards:
   * `?eventId=` for an organizer's own event (or admin, any event);
   * omitted for admin-only system-wide stats.
   */
  @Get("orders/stats")
  @UseGuards(RequireAuthGuard)
  stats(@CurrentActor() actor: { userId: string; role: Role }, @Query() query: GetOrderStatsDto) {
    if (query.eventId) {
      if (actor.role !== Role.ORGANIZER && actor.role !== Role.ADMIN) {
        throw new ForbiddenException("Only organizers/admins can view sales stats");
      }
      return this.ordersService.getEventStats(query.eventId, actor, query);
    }
    if (actor.role !== Role.ADMIN) {
      throw new ForbiddenException("System-wide stats are admin-only");
    }
    return this.ordersService.getSystemStats(query);
  }

  @Get("orders/:id")
  @UseGuards(RequireAuthGuard)
  findOne(@Param("id") id: string, @CurrentActor() actor: { userId: string; role: Role }) {
    if (actor.role === Role.ORGANIZER || actor.role === Role.ADMIN) {
      throw new ForbiddenException("Use the dashboard listing for order detail as organizer/admin");
    }
    return this.ordersService.findOwned(id, actor.userId);
  }

  @Post("orders/:id/apply-discount")
  @UseGuards(RequireAuthGuard)
  applyDiscount(
    @Param("id") id: string,
    @CurrentActor() actor: { userId: string },
    @Body() dto: ApplyDiscountDto,
  ) {
    return this.ordersService.applyDiscount(id, actor.userId, dto);
  }

  /** 0đ orders: fulfil without a payment (free registration / 100% discount). */
  @Post("orders/:id/confirm-free")
  @UseGuards(RequireAuthGuard)
  confirmFree(@Param("id") id: string, @CurrentActor() actor: { userId: string }) {
    return this.ordersService.confirmFree(id, actor.userId);
  }

  @Post("orders/:id/cancel")
  @UseGuards(RequireAuthGuard)
  cancel(@Param("id") id: string, @CurrentActor() actor: { userId: string }) {
    return this.ordersService.cancel(id, actor.userId);
  }
}
