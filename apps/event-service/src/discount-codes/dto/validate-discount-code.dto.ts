import { IsString } from "class-validator";

export class ValidateDiscountCodeDto {
  @IsString()
  eventId!: string;

  @IsString()
  code!: string;
}
