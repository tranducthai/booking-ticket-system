import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { IsString, MinLength } from "class-validator";
import { WaitingRoomService } from "./waiting-room.service";

class JoinDto {
  @IsString()
  @MinLength(1)
  sessionId!: string;
}

class StatusQueryDto {
  @IsString()
  @MinLength(1)
  sessionId!: string;
}

@Controller("events/:eventId/waiting-room")
export class WaitingRoomController {
  constructor(private readonly waitingRoom: WaitingRoomService) {}

  @Post("join")
  join(@Param("eventId") eventId: string, @Body() dto: JoinDto) {
    return this.waitingRoom.join(eventId, dto.sessionId);
  }

  @Get("status")
  status(@Param("eventId") eventId: string, @Query() query: StatusQueryDto) {
    return this.waitingRoom.status(eventId, query.sessionId);
  }
}
