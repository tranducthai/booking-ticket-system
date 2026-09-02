import { Global, Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { WaitingRoomController } from "./waiting-room.controller";
import { WaitingRoomGuard } from "./waiting-room.guard";
import { WaitingRoomService } from "./waiting-room.service";

// Global — WaitingRoomGuard is applied from EventsController and
// SeatMapController, in different feature modules; simplest to make it
// available everywhere like this service's other cross-cutting infra
// (PrismaModule, RedisModule) rather than importing WaitingRoomModule
// into every module that happens to guard a route with it.
@Global()
@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [WaitingRoomController],
  providers: [WaitingRoomService, WaitingRoomGuard],
  exports: [WaitingRoomGuard, WaitingRoomService],
})
export class WaitingRoomModule {}
