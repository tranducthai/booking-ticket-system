import { Module } from "@nestjs/common";
import { ShowtimesController } from "./showtimes.controller";
import { ShowtimesService } from "./showtimes.service";

@Module({
  controllers: [ShowtimesController],
  providers: [ShowtimesService],
})
export class ShowtimesModule {}
