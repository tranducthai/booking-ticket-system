import { Module } from "@nestjs/common";
import { ArtistPageController } from "./artist-page.controller";
import { ArtistPageService } from "./artist-page.service";
import { ArtistsController } from "./artists.controller";
import { ArtistsService } from "./artists.service";
import { EventArtistsController } from "./event-artists.controller";

@Module({
  controllers: [ArtistsController, EventArtistsController, ArtistPageController],
  providers: [ArtistsService, ArtistPageService],
})
export class ArtistsModule {}
