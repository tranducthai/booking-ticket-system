import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { InternalTokenGuard } from "../common/internal-token.guard";
import { RefundLockDto, RefundUnlockDto } from "./dto/refund-lock.dto";
import { TicketsService } from "./tickets.service";

/**
 * by-event: notification-service (event-reminder cron, event-canceled notice).
 * refund-lock/unlock: payment-service's refund workflow
 * (docs/spec/13-refund-and-anti-fraud-design.md §2.2) — synchronous on
 * purpose: payment-service must know the tickets are locked BEFORE it
 * accepts the request, an async event would leave a window to check in.
 */
@Controller("internal/tickets")
@UseGuards(InternalTokenGuard)
export class InternalTicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get("by-event/:eventId")
  byEvent(@Param("eventId") eventId: string, @Query("includeEventCanceled") includeEventCanceled?: string) {
    return this.ticketsService.attendeeUserIdsForEvent(eventId, includeEventCanceled === "true");
  }

  @Post("refund-lock")
  lock(@Body() dto: RefundLockDto) {
    return this.ticketsService.lockForRefund(dto.orderItemIds, dto.refundId);
  }

  @Post("refund-unlock")
  unlock(@Body() dto: RefundUnlockDto) {
    return this.ticketsService.unlockForRefund(dto.refundId);
  }
}
