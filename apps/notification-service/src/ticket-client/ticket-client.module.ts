import { Global, Module } from "@nestjs/common";
import { TicketServiceClient } from "./ticket-service.client";

@Global()
@Module({
  providers: [TicketServiceClient],
  exports: [TicketServiceClient],
})
export class TicketClientModule {}
