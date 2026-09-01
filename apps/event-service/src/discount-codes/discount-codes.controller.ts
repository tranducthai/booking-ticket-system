import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentActor } from "../auth/current-actor.decorator";
import { RequireAuthGuard } from "../auth/require-auth.guard";
import { Role } from "../auth/role";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { DiscountCodesService } from "./discount-codes.service";
import { CreateDiscountCodeDto } from "./dto/create-discount-code.dto";
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

  @Get("discount-codes/validate")
  validate(@Query() query: ValidateDiscountCodeDto) {
    return this.discountCodesService.validate(query.eventId, query.code);
  }
}
