import { Transform, Type } from "class-transformer";
import { IsDate, IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, Matches, Max, Min } from "class-validator";
import { IsAfter, IsFuture, MAX_PRICE } from "../../common/validators";
import { DiscountType } from "../../generated/prisma";

export class CreateDiscountCodeDto {
  /** Stored upper-case: buyers type it in any case. */
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toUpperCase() : value))
  @IsString()
  @Matches(/^[A-Z0-9_-]{3,20}$/, { message: "Mã giảm giá 3–20 ký tự, chỉ gồm chữ, số, - và _" })
  code!: string;

  @IsEnum(DiscountType)
  discountType!: DiscountType;

  /** PERCENT: 1-100 (checked in discount-codes.service.ts, which knows the type); FIXED: dong off the order. */
  @IsNumber()
  @IsPositive({ message: "Giá trị giảm phải lớn hơn 0" })
  @Max(MAX_PRICE)
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
  @IsFuture("Ngày hết hạn phải sau thời điểm hiện tại")
  @IsAfter("validFrom", "Ngày hết hạn phải sau ngày bắt đầu hiệu lực")
  validTo?: Date;
}
