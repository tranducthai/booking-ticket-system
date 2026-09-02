import { Module } from "@nestjs/common";
import { PaymentEventsConsumer } from "./payment-events.consumer";
import { RefundEventsConsumer } from "./refund-events.consumer";

@Module({
  providers: [PaymentEventsConsumer, RefundEventsConsumer],
})
export class SagasModule {}
