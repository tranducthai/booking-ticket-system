import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { IsString, MinLength } from "class-validator";
import { InternalTokenGuard } from "../common/internal-token.guard";
import { PaymentsService } from "./payments.service";

class AutoRefundDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}

/** Called by Booking Service only — see payments.service.ts autoRefund() doc comment. */
@Controller("internal/payments")
@UseGuards(InternalTokenGuard)
export class InternalPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post(":orderId/auto-refund")
  autoRefund(@Param("orderId") orderId: string, @Body() dto: AutoRefundDto) {
    return this.paymentsService.autoRefund(orderId, dto.reason);
  }
}
