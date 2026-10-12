import { Module } from "@nestjs/common";
import { MockGateway } from "./mock.gateway";
import { MomoGateway } from "./momo.gateway";
import { PaymentGatewayResolver } from "./payment-gateway.resolver";
import { PaypalGateway } from "./paypal.gateway";
import { SepayGateway } from "./sepay.gateway";
import { VnpaySandboxGateway } from "./vnpay-sandbox.gateway";

@Module({
  providers: [VnpaySandboxGateway, MomoGateway, PaypalGateway, SepayGateway, MockGateway, PaymentGatewayResolver],
  exports: [PaymentGatewayResolver],
})
export class GatewayModule {}
