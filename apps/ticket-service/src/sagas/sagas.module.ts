import { Module } from "@nestjs/common";
import { EventCanceledConsumer } from "./event-canceled.consumer";
import { OrderCanceledConsumer } from "./order-canceled.consumer";
import { OrderPaidConsumer } from "./order-paid.consumer";

@Module({
  providers: [OrderPaidConsumer, OrderCanceledConsumer, EventCanceledConsumer],
})
export class SagasModule {}
