import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { EventClientModule } from "./event-client/event-client.module";
import { HealthController } from "./health/health.controller";
import { MailerModule } from "./mailer/mailer.module";
import { MetricsModule } from "./metrics/metrics.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { RabbitMqModule } from "./rabbitmq/rabbitmq.module";
import { TicketClientModule } from "./ticket-client/ticket-client.module";
import { UserClientModule } from "./user-client/user-client.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MetricsModule,
    RabbitMqModule,
    MailerModule,
    UserClientModule,
    EventClientModule,
    TicketClientModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
