import { Type } from "class-transformer";
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";
import { TicketDeliveryMethod } from "../../generated/prisma";

export class CreateTicketTypeDto {
  /** Required when the event has showtimes: which performance this tier (and its inventory) is for. */
  @IsOptional()
  @IsUUID()
  showtimeId?: string;

  @IsString()
  name!: string;

  @IsNumber()
  price!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantityTotal!: number;

  @IsOptional()
  @Type(() => Date)
  salesStart?: Date;

  @IsOptional()
  @Type(() => Date)
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
