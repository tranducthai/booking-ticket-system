import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { CategoriesModule } from "./categories/categories.module";
import { DiscountCodesModule } from "./discount-codes/discount-codes.module";
import { EventsModule } from "./events/events.module";
import { HealthController } from "./health/health.controller";
import { HoldsModule } from "./holds/holds.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { SeatMapModule } from "./seat-map/seat-map.module";
import { TicketTypesModule } from "./ticket-types/ticket-types.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    CategoriesModule,
    EventsModule,
    TicketTypesModule,
    SeatMapModule,
    HoldsModule,
    DiscountCodesModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
