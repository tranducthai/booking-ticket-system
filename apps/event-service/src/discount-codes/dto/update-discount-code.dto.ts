import { Type } from "class-transformer";
import { IsBoolean, IsDate, IsEnum, IsInt, IsNumber, IsOptional, IsPositive, Max, Min } from "class-validator";
import { IsAfter, MAX_PRICE } from "../../common/validators";
import { DiscountType } from "../../generated/prisma";

/** Deliberately no `code` field — changing the code text itself isn't supported (see discount-codes.service.ts update()'s doc comment); create a new one instead. */
export class UpdateDiscountCodeDto {
  @IsOptional()
  @IsEnum(DiscountType)
  discountType?: DiscountType;

  @IsOptional()
  @IsNumber()
  @IsPositive({ message: "Giá trị giảm phải lớn hơn 0" })
  @Max(MAX_PRICE)
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
  @IsAfter("validFrom", "Ngày hết hạn phải sau ngày bắt đầu hiệu lực")
  validTo?: Date;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
