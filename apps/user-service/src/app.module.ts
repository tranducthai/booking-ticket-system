import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { HealthController } from "./health/health.controller";
import { MetricsModule } from "./metrics/metrics.module";
import { PrismaModule } from "./prisma/prisma.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, MetricsModule, AuthModule, UsersModule],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
