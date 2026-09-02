import { IsIn, IsUUID } from "class-validator";

export class CreatePaymentDto {
  @IsUUID()
  orderId!: string;

  @IsIn(["vnpay", "momo", "zalopay", "card"])
  method!: string;
}
