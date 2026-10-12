import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { InternalTokenGuard } from "../common/internal-token.guard";
import { WaitingRoomService } from "./waiting-room.service";

/**
 * booking-service checks admission before holding seats for a high-demand
 * event — the queue used to gate only READING the event, so a bot could
 * skip it and POST /cart/hold directly.
 */
@Controller("internal/waiting-room")
@UseGuards(InternalTokenGuard)
export class InternalWaitingRoomController {
  constructor(private readonly waitingRoom: WaitingRoomService) {}

  @Get(":eventId/admitted")
  async admitted(@Param("eventId") eventId: string, @Query("sessionId") sessionId?: string) {
    return { admitted: !!sessionId && (await this.waitingRoom.isAdmitted(eventId, sessionId)) };
  }
}
