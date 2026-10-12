import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ActivityLogModule } from "./activity-log/activity-log.module";
import { EventClientModule } from "./event-client/event-client.module";
import { HealthController } from "./health/health.controller";
import { MetricsModule } from "./metrics/metrics.module";
import { PrismaModule } from "./prisma/prisma.module";
import { QrModule } from "./qr/qr.module";
import { RabbitMqModule } from "./rabbitmq/rabbitmq.module";
import { SagasModule } from "./sagas/sagas.module";
import { TicketsModule } from "./tickets/tickets.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ActivityLogModule,
    RabbitMqModule,
    MetricsModule,
    QrModule,
    EventClientModule,
    TicketsModule,
    SagasModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
