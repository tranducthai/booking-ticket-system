import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { InternalTokenGuard } from "../common/internal-token.guard";
import { HoldSeatDto } from "./dto/hold-seat.dto";
import { HoldSeatsBatchDto } from "./dto/hold-seats-batch.dto";
import { ReleaseSeatDto } from "./dto/release-seat.dto";
import { ReserveTicketTypeDto } from "./dto/reserve-ticket-type.dto";
import { HoldsService } from "./holds.service";

/**
 * Internal endpoints — called service-to-service (Booking Service), not
 * exposed through the API Gateway path map. See docs/spec/08-api-contracts.md.
 */
@Controller("internal")
@UseGuards(InternalTokenGuard)
export class HoldsController {
  constructor(private readonly holdsService: HoldsService) {}

  @Post("seats/:id/hold")
  hold(@Param("id") id: string, @Body() dto: HoldSeatDto) {
    return this.holdsService.holdSeat(id, dto.orderId, dto.userId);
  }

  @Post("seats/hold-batch")
  holdBatch(@Body() dto: HoldSeatsBatchDto) {
    return this.holdsService.holdSeatsBatch(dto.seatIds, dto.orderId, dto.userId);
  }

  @Post("seats/:id/extend-hold")
  extendHold(@Param("id") id: string, @Body() dto: ReleaseSeatDto) {
    return this.holdsService.extendHold(id, dto.orderId, dto.userId);
  }

  @Post("seats/:id/release")
  release(@Param("id") id: string, @Body() dto: ReleaseSeatDto) {
    return this.holdsService.releaseSeat(id, dto.orderId, dto.userId);
  }

  @Post("seats/:id/confirm")
  confirm(@Param("id") id: string, @Body() dto: ReleaseSeatDto) {
    return this.holdsService.confirmSeat(id, dto.orderId, dto.userId);
  }

  @Post("ticket-types/:id/reserve")
  reserve(@Param("id") id: string, @Body() dto: ReserveTicketTypeDto) {
    return this.holdsService.reserveTicketType(id, dto.quantity);
  }

  @Post("ticket-types/:id/release")
  releaseTicketType(@Param("id") id: string, @Body() dto: ReserveTicketTypeDto) {
    return this.holdsService.releaseTicketType(id, dto.quantity);
  }
}
