import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { SeatMapController } from "./seat-map.controller";
import { SeatMapGateway } from "./seat-map.gateway";
import { SeatMapService } from "./seat-map.service";
import { SeatSnapshotJob } from "./seat-snapshot.job";

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [SeatMapController],
  providers: [SeatMapService, SeatMapGateway, SeatSnapshotJob],
  exports: [SeatMapGateway],
})
export class SeatMapModule {}
