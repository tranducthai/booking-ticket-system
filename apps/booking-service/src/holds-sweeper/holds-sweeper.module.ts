import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { HoldsSweeperService } from "./holds-sweeper.service";

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [HoldsSweeperService],
})
export class HoldsSweeperModule {}
