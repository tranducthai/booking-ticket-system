import { Global, Module } from "@nestjs/common";
import { BookingServiceClient } from "./booking-service.client";

@Global()
@Module({
  providers: [BookingServiceClient],
  exports: [BookingServiceClient],
})
export class BookingClientModule {}
