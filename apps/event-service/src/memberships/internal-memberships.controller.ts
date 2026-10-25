import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ArrayMaxSize, IsArray, IsBoolean, IsNumber, IsString, IsUUID, Min } from "class-validator";
import { InternalTokenGuard } from "../common/internal-token.guard";
import { MembershipsService } from "./memberships.service";

class ActivateMembershipDto {
  @IsUUID()
  orderId!: string;

  @IsUUID()
  planId!: string;

  @IsString()
  userId!: string;

  @IsNumber()
  @Min(0)
  pricePaid!: number;
}

class PurchaseCheckDto {
  @IsString()
  userId!: string;

  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID("all", { each: true })
  ticketTypeIds!: string[];

  @IsBoolean()
  includesSeats!: boolean;
}

/** booking-service: open a MEMBERSHIP order, activate the card once it's paid, and gate every ticket hold on the sales window. */
@Controller("internal")
@UseGuards(InternalTokenGuard)
export class InternalMembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get("membership-plans/:id")
  plan(@Param("id") id: string, @Query("userId") userId: string) {
    return this.memberships.planForCheckout(id, userId);
  }

  @Post("memberships/activate")
  activate(@Body() dto: ActivateMembershipDto) {
    return this.memberships.activate(dto);
  }

  @Post("events/:id/purchase-check")
  purchaseCheck(@Param("id") id: string, @Body() dto: PurchaseCheckDto) {
    return this.memberships.purchaseCheck(id, dto.userId, dto.ticketTypeIds, dto.includesSeats);
  }
}
