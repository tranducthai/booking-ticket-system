import { Global, Module } from "@nestjs/common";
import { PaymentServiceClient } from "./payment-service.client";

@Global()
@Module({
  providers: [PaymentServiceClient],
  exports: [PaymentServiceClient],
})
export class PaymentClientModule {}
