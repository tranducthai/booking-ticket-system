import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PAYMENT_GATEWAY } from "./payment-gateway.interface";
import { MockGateway } from "./mock.gateway";
import { VnpaySandboxGateway } from "./vnpay-sandbox.gateway";

@Module({
  providers: [
    VnpaySandboxGateway,
    MockGateway,
    {
      provide: PAYMENT_GATEWAY,
      inject: [ConfigService, VnpaySandboxGateway, MockGateway],
      useFactory: (config: ConfigService, vnpay: VnpaySandboxGateway, mock: MockGateway) =>
        (config.get<string>("PAYMENT_GATEWAY_MODE") ?? "mock") === "vnpay" ? vnpay : mock,
    },
  ],
  exports: [PAYMENT_GATEWAY, MockGateway],
})
export class GatewayModule {}
