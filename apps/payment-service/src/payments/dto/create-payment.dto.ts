import { IsIn, IsUUID } from "class-validator";
import { GATEWAY_METHODS } from "../../gateway/payment-gateway.interface";

export class CreatePaymentDto {
  @IsUUID()
  orderId!: string;

  @IsIn(GATEWAY_METHODS)
  method!: string;
}
