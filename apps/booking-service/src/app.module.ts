import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { CartModule } from "./cart/cart.module";
import { EventClientModule } from "./event-client/event-client.module";
import { HealthController } from "./health/health.controller";
import { HoldsSweeperModule } from "./holds-sweeper/holds-sweeper.module";
import { OrdersModule } from "./orders/orders.module";
import { PaymentClientModule } from "./payment-client/payment-client.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RabbitMqModule } from "./rabbitmq/rabbitmq.module";
import { SagasModule } from "./sagas/sagas.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RabbitMqModule,
    EventClientModule,
    PaymentClientModule,
    CartModule,
    OrdersModule,
    SagasModule,
    HoldsSweeperModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
