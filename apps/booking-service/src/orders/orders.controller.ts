import { Body, Controller, ForbiddenException, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentActor } from "../auth/current-actor.decorator";
import { RequireAuthGuard } from "../auth/require-auth.guard";
import { Role } from "../auth/role";
import { ApplyDiscountDto } from "./dto/apply-discount.dto";
import { ListOrdersDto } from "./dto/list-orders.dto";
import { OrdersService } from "./orders.service";

@Controller()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * One path, role-dependent behaviour (docs/spec/08-api-contracts.md §3):
   * customers see their own orders; organizer/admin get the unscoped
   * dashboard view filtered by eventId/status.
   */
  @Get("orders")
  @UseGuards(RequireAuthGuard)
  list(@CurrentActor() actor: { userId: string; role: Role }, @Query() query: ListOrdersDto) {
    if (actor.role === Role.ORGANIZER || actor.role === Role.ADMIN) {
      return this.ordersService.listForDashboard(query);
    }
    return this.ordersService.listMine(actor.userId, query);
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

  @Post("orders/:id/cancel")
  @UseGuards(RequireAuthGuard)
  cancel(@Param("id") id: string, @CurrentActor() actor: { userId: string }) {
    return this.ordersService.cancel(id, actor.userId);
  }
}
