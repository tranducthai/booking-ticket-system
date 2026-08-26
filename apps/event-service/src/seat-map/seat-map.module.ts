import { Module } from "@nestjs/common";
import { SeatMapController } from "./seat-map.controller";
import { SeatMapGateway } from "./seat-map.gateway";
import { SeatMapService } from "./seat-map.service";

@Module({
  controllers: [SeatMapController],
  providers: [SeatMapService, SeatMapGateway],
  exports: [SeatMapGateway],
})
export class SeatMapModule {}
