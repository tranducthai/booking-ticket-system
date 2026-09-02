import { IsString, IsUUID, MinLength } from "class-validator";

export class RedeemDiscountCodeDto {
  @IsUUID()
  eventId!: string;

  @IsString()
  @MinLength(1)
  code!: string;
}
