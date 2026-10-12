import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
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

  /** Paid orders of one event — payment-service's mass refund on EventCanceled (docs/spec/13-refund-and-anti-fraud-design.md §2.3). Must be registered before ":id". */
  @Get("paid-by-event/:eventId")
  paidByEvent(@Param("eventId") eventId: string) {
    return this.ordersService.listPaidForEvent(eventId);
  }

  /** Unscoped read for payment-service's refund review — organizer/admin authorization is decided there against the order's eventId. */
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.ordersService.findById(id);
  }
}
