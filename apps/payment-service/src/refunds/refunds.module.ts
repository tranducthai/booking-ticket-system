import { Module } from "@nestjs/common";
import { GatewayModule } from "../gateway/gateway.module";
import { RefundsController } from "./refunds.controller";
import { RefundsService } from "./refunds.service";

@Module({
  imports: [GatewayModule],
  controllers: [RefundsController],
  providers: [RefundsService],
})
export class RefundsModule {}
