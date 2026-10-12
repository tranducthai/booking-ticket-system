import { Global, Module } from "@nestjs/common";
import { EventServiceClient } from "./event-service.client";

@Global()
@Module({
  providers: [EventServiceClient],
  exports: [EventServiceClient],
})
export class EventClientModule {}
