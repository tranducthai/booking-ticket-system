import { Module } from "@nestjs/common";
import { ArtistsController } from "./artists.controller";
import { ArtistsService } from "./artists.service";
import { EventArtistsController } from "./event-artists.controller";

@Module({
  controllers: [ArtistsController, EventArtistsController],
  providers: [ArtistsService],
})
export class ArtistsModule {}
