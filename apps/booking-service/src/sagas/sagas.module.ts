import { Module } from "@nestjs/common";
import { OrdersModule } from "../orders/orders.module";
import { EventCanceledConsumer } from "./event-canceled.consumer";
import { PaymentEventsConsumer } from "./payment-events.consumer";
import { RefundEventsConsumer } from "./refund-events.consumer";

@Module({
  imports: [OrdersModule],
  providers: [PaymentEventsConsumer, RefundEventsConsumer, EventCanceledConsumer],
})
export class SagasModule {}
