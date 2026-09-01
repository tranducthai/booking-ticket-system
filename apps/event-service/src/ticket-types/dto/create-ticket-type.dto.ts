import { Type } from "class-transformer";
import { IsInt, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CreateTicketTypeDto {
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
}
