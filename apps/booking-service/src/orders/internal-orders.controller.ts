import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { IsUUID } from "class-validator";
import { InternalTokenGuard } from "../common/internal-token.guard";
import { OrdersService } from "./orders.service";

class StartPaymentDto {
  @IsUUID()
  userId!: string;
}

/** Called by Payment Service only — see orders.service.ts startPayment() doc comment. */
@Controller("internal/orders")
@UseGuards(InternalTokenGuard)
export class InternalOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post(":id/start-payment")
  startPayment(@Param("id") id: string, @Body() dto: StartPaymentDto) {
    return this.ordersService.startPayment(id, dto.userId);
  }
}
