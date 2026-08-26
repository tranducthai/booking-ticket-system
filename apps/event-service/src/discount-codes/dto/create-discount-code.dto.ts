import { Type } from "class-transformer";
import { IsDate, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from "class-validator";
import { DiscountType } from "@prisma/client";

export class CreateDiscountCodeDto {
  @IsString()
  code!: string;

  @IsEnum(DiscountType)
  discountType!: DiscountType;

  @IsNumber()
  value!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantityTotal!: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  validFrom?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  validTo?: Date;
}
