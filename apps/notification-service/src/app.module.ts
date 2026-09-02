import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthController } from "./health/health.controller";
import { MailerModule } from "./mailer/mailer.module";
import { MetricsModule } from "./metrics/metrics.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { RabbitMqModule } from "./rabbitmq/rabbitmq.module";
import { UserClientModule } from "./user-client/user-client.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MetricsModule,
    RabbitMqModule,
    MailerModule,
    UserClientModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
