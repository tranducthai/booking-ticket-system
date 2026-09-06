import { Type } from "class-transformer";
import { IsBoolean, IsDate, IsEnum, IsInt, IsNumber, IsOptional, Min } from "class-validator";
import { DiscountType } from "../../generated/prisma";

/** Deliberately no `code` field — changing the code text itself isn't supported (see discount-codes.service.ts update()'s doc comment); create a new one instead. */
export class UpdateDiscountCodeDto {
  @IsOptional()
  @IsEnum(DiscountType)
  discountType?: DiscountType;

  @IsOptional()
  @IsNumber()
  value?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantityTotal?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  validFrom?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  validTo?: Date;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
