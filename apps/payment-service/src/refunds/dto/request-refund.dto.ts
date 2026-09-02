import { IsString, IsUUID, MinLength } from "class-validator";

export class RequestRefundDto {
  @IsUUID()
  orderId!: string;

  @IsString()
  @MinLength(1)
  reason!: string;
}
