import { IsString, MinLength } from "class-validator";

export class ApplyDiscountDto {
  @IsString()
  @MinLength(1)
  code!: string;
}
