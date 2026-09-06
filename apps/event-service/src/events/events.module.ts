import { Module } from "@nestjs/common";
import { EventsController } from "./events.controller";
import { EventsService } from "./events.service";
import { FavoritesService } from "./favorites.service";

@Module({
  controllers: [EventsController],
  providers: [EventsService, FavoritesService],
  exports: [EventsService],
})
export class EventsModule {}
