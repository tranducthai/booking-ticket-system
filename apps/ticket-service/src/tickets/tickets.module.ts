import { Module } from "@nestjs/common";
import { InternalTicketsController } from "./internal-tickets.controller";
import { TicketsController } from "./tickets.controller";
import { TicketsService } from "./tickets.service";

@Module({
  controllers: [TicketsController, InternalTicketsController],
  providers: [TicketsService],
})
export class TicketsModule {}
