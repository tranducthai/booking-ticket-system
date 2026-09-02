import { Module } from "@nestjs/common";
import { OrderCanceledConsumer } from "./order-canceled.consumer";
import { OrderPaidConsumer } from "./order-paid.consumer";

@Module({
  providers: [OrderPaidConsumer, OrderCanceledConsumer],
})
export class SagasModule {}
