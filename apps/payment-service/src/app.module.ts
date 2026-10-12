import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ActivityLogModule } from "./activity-log/activity-log.module";
import { BookingClientModule } from "./booking-client/booking-client.module";
import { EventClientModule } from "./event-client/event-client.module";
import { TicketClientModule } from "./ticket-client/ticket-client.module";
import { HealthController } from "./health/health.controller";
import { MetricsModule } from "./metrics/metrics.module";
import { PaymentsModule } from "./payments/payments.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RabbitMqModule } from "./rabbitmq/rabbitmq.module";
import { RefundsModule } from "./refunds/refunds.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ActivityLogModule,
    RabbitMqModule,
    MetricsModule,
    BookingClientModule,
    EventClientModule,
    TicketClientModule,
    PaymentsModule,
    RefundsModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
