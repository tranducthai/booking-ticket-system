import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentActor } from "../auth/current-actor.decorator";
import { RequireAuthGuard } from "../auth/require-auth.guard";
import { Role } from "../auth/role";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { InternalTokenGuard } from "../common/internal-token.guard";
import { DiscountCodesService } from "./discount-codes.service";
import { CreateDiscountCodeDto } from "./dto/create-discount-code.dto";
import { RedeemDiscountCodeDto } from "./dto/redeem-discount-code.dto";
import { UpdateDiscountCodeDto } from "./dto/update-discount-code.dto";
import { ValidateDiscountCodeDto } from "./dto/validate-discount-code.dto";

@Controller()
export class DiscountCodesController {
  constructor(private readonly discountCodesService: DiscountCodesService) {}

  @Post("events/:eventId/discount-codes")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER)
  create(
    @Param("eventId") eventId: string,
    @CurrentActor() actor: { userId: string },
    @Body() dto: CreateDiscountCodeDto,
  ) {
    return this.discountCodesService.create(eventId, actor.userId, dto);
  }

  /** Organizer's own management list (incl. inactive/expired codes + quantityUsed) — admin can view any event's too. */
  @Get("events/:eventId/discount-codes")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER, Role.ADMIN)
  list(@Param("eventId") eventId: string, @CurrentActor() actor: { userId: string; role: Role }) {
    return this.discountCodesService.listForEvent(eventId, actor.userId, actor.role === Role.ADMIN);
  }

  @Patch("discount-codes/:id")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER)
  update(@Param("id") id: string, @CurrentActor() actor: { userId: string }, @Body() dto: UpdateDiscountCodeDto) {
    return this.discountCodesService.update(id, actor.userId, dto);
  }

  @Delete("discount-codes/:id")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER)
  remove(@Param("id") id: string, @CurrentActor() actor: { userId: string }) {
    return this.discountCodesService.remove(id, actor.userId);
  }

  @Get("discount-codes/validate")
  validate(@Query() query: ValidateDiscountCodeDto) {
    return this.discountCodesService.validate(query.eventId, query.code);
  }

  @Post("internal/discount-codes/redeem")
  @UseGuards(InternalTokenGuard)
  redeem(@Body() dto: RedeemDiscountCodeDto) {
    return this.discountCodesService.redeem(dto.eventId, dto.code);
  }

  @Post("internal/discount-codes/release")
  @UseGuards(InternalTokenGuard)
  release(@Body() dto: RedeemDiscountCodeDto) {
    return this.discountCodesService.release(dto.eventId, dto.code);
  }
}
