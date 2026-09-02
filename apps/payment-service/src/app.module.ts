import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { BookingClientModule } from "./booking-client/booking-client.module";
import { HealthController } from "./health/health.controller";
import { PaymentsModule } from "./payments/payments.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RabbitMqModule } from "./rabbitmq/rabbitmq.module";
import { RefundsModule } from "./refunds/refunds.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RabbitMqModule,
    BookingClientModule,
    PaymentsModule,
    RefundsModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
