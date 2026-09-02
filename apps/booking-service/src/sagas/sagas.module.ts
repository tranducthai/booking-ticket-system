import { Module } from "@nestjs/common";
import { OrdersModule } from "../orders/orders.module";
import { PaymentEventsConsumer } from "./payment-events.consumer";
import { RefundEventsConsumer } from "./refund-events.consumer";

@Module({
  imports: [OrdersModule],
  providers: [PaymentEventsConsumer, RefundEventsConsumer],
})
export class SagasModule {}
