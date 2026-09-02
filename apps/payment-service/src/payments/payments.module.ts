import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { GatewayModule } from "../gateway/gateway.module";
import { InternalPaymentsController } from "./internal-payments.controller";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { ReconciliationService } from "./reconciliation.service";

@Module({
  imports: [GatewayModule, ScheduleModule.forRoot()],
  controllers: [PaymentsController, InternalPaymentsController],
  providers: [PaymentsService, ReconciliationService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
