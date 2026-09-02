import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { OrdersModule } from "../orders/orders.module";
import { HoldsSweeperService } from "./holds-sweeper.service";

@Module({
  imports: [ScheduleModule.forRoot(), OrdersModule],
  providers: [HoldsSweeperService],
})
export class HoldsSweeperModule {}
