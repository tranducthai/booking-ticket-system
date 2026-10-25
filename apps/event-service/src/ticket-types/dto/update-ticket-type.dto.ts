import { Transform, Type } from "class-transformer";
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min } from "class-validator";
import { IsAfter, MAX_PRICE, trimString } from "../../common/validators";
import { TicketDeliveryMethod } from "../../generated/prisma";

export class UpdateTicketTypeDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Length(1, 100, { message: "Tên hạng vé từ 1 đến 100 ký tự" })
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0, { message: "Giá vé không được âm" })
  @Max(MAX_PRICE, { message: "Giá vé tối đa 1.000.000.000đ" })
  price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000, { message: "Số lượng tối đa 100.000 vé" })
  quantityTotal?: number;

  @IsOptional()
  @Type(() => Date)
  salesStart?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsAfter("salesStart", "Thời gian đóng bán phải sau thời gian mở bán")
  salesEnd?: Date;

  @IsOptional()
  @IsEnum(TicketDeliveryMethod)
  deliveryMethod?: TicketDeliveryMethod;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minPerOrder?: number;

  /** null clears it (no per-order cap beyond the event's own). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxPerOrder?: number | null;

  @IsOptional()
  @IsBoolean()
  isHidden?: boolean;
}
