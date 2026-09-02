import { Module } from "@nestjs/common";
import { SeatMapModule } from "../seat-map/seat-map.module";
import { HoldsController } from "./holds.controller";
import { HoldsService } from "./holds.service";
import { OrderCanceledConsumer } from "./order-canceled.consumer";
import { SeatLockService } from "./seat-lock.service";

@Module({
  imports: [SeatMapModule],
  controllers: [HoldsController],
  providers: [HoldsService, SeatLockService, OrderCanceledConsumer],
})
export class HoldsModule {}
