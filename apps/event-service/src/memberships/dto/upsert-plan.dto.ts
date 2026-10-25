import { Transform } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from "class-validator";
import { MAX_PRICE, trimString } from "../../common/validators";

export class UpsertMembershipPlanDto {
  @Transform(trimString)
  @IsString()
  @Length(3, 100, { message: "Tên thẻ từ 3 đến 100 ký tự" })
  name!: string;

  @IsInt({ message: "Giá thẻ phải là số nguyên" })
  @Min(0, { message: "Giá thẻ không được âm" })
  @Max(MAX_PRICE, { message: "Giá thẻ quá lớn" })
  price!: number;

  @IsInt({ message: "Thời hạn phải là số ngày nguyên" })
  @Min(7, { message: "Thời hạn tối thiểu 7 ngày" })
  @Max(730, { message: "Thời hạn tối đa 730 ngày" })
  durationDays!: number;

  @IsInt({ message: "Mức giảm giá phải là số nguyên" })
  @Min(0, { message: "Mức giảm giá từ 0% đến 50%" })
  @Max(50, { message: "Mức giảm giá từ 0% đến 50%" })
  discountPercent!: number;

  @IsInt({ message: "Số giờ mua sớm phải là số nguyên" })
  @Min(0, { message: "Số giờ mua sớm từ 0 đến 336 (14 ngày)" })
  @Max(336, { message: "Số giờ mua sớm từ 0 đến 336 (14 ngày)" })
  presaleHours!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: "Quyền lợi khác tối đa 2000 ký tự" })
  benefits?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
