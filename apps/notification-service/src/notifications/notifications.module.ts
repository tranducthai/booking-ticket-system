import { Module } from "@nestjs/common";
import { OrderPaidConsumer } from "./order-paid.consumer";
import { TicketIssuedConsumer } from "./ticket-issued.consumer";

@Module({
  providers: [OrderPaidConsumer, TicketIssuedConsumer],
})
export class NotificationsModule {}
