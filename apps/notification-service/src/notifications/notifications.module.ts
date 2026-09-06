import { Module } from "@nestjs/common";
import { EventReminderService } from "./event-reminder.service";
import { OrderPaidConsumer } from "./order-paid.consumer";
import { TicketIssuedConsumer } from "./ticket-issued.consumer";

@Module({
  providers: [OrderPaidConsumer, TicketIssuedConsumer, EventReminderService],
})
export class NotificationsModule {}
