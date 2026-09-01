import { Module } from "@nestjs/common";
import { SeatMapModule } from "../seat-map/seat-map.module";
import { HoldsController } from "./holds.controller";
import { HoldsService } from "./holds.service";
import { SeatLockService } from "./seat-lock.service";

@Module({
  imports: [SeatMapModule],
  controllers: [HoldsController],
  providers: [HoldsService, SeatLockService],
})
export class HoldsModule {}
