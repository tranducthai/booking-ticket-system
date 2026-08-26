import { Body, Controller, Param, Post } from "@nestjs/common";
import { HoldSeatDto } from "./dto/hold-seat.dto";
import { ReserveTicketTypeDto } from "./dto/reserve-ticket-type.dto";
import { HoldsService } from "./holds.service";

/**
 * Internal endpoints — called service-to-service (Booking Service), not
 * exposed through the Gateway/Ingress path map. See docs/spec/08-api-contracts.md.
 */
@Controller("internal")
export class HoldsController {
  constructor(private readonly holdsService: HoldsService) {}

  @Post("seats/:id/hold")
  hold(@Param("id") id: string, @Body() dto: HoldSeatDto) {
    return this.holdsService.holdSeat(id, dto.orderId);
  }

  @Post("seats/:id/release")
  release(@Param("id") id: string) {
    return this.holdsService.releaseSeat(id);
  }

  @Post("seats/:id/confirm")
  confirm(@Param("id") id: string) {
    return this.holdsService.confirmSeat(id);
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
