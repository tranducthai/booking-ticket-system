import { Type } from "class-transformer";
import { IsInt, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class UpdateTicketTypeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantityTotal?: number;

  @IsOptional()
  @Type(() => Date)
  salesStart?: Date;

  @IsOptional()
  @Type(() => Date)
  salesEnd?: Date;
}
