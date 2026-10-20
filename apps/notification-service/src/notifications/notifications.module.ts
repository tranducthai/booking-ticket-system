import { Module } from "@nestjs/common";
import { InboxModule } from "../inbox/inbox.module";
import { EventLifecycleConsumer } from "./event-lifecycle.consumer";
import { EventReminderService } from "./event-reminder.service";
import { EventStatusConsumer } from "./event-status.consumer";
import { OrderPaidConsumer } from "./order-paid.consumer";
import { PasswordResetConsumer } from "./password-reset.consumer";
import { RefundApprovedConsumer } from "./refund-approved.consumer";
import { TicketIssuedConsumer } from "./ticket-issued.consumer";

@Module({
  imports: [InboxModule],
  providers: [OrderPaidConsumer, TicketIssuedConsumer, EventReminderService, EventStatusConsumer, RefundApprovedConsumer, EventLifecycleConsumer, PasswordResetConsumer],
})
export class NotificationsModule {}
