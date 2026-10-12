import { Module } from "@nestjs/common";
import { GatewayModule } from "../gateway/gateway.module";
import { EvidenceStorageService } from "./evidence/evidence-storage.service";
import { EventCanceledConsumer } from "./event-canceled.consumer";
import { RefundProcessorService } from "./refund-processor.service";
import { RefundsController } from "./refunds.controller";
import { RefundsService } from "./refunds.service";

@Module({
  imports: [GatewayModule],
  controllers: [RefundsController],
  providers: [RefundsService, RefundProcessorService, EvidenceStorageService, EventCanceledConsumer],
})
export class RefundsModule {}
