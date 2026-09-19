import { Type } from "class-transformer";
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from "class-validator";
import { TicketDeliveryMethod } from "../../generated/prisma";

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

  @IsOptional()
  @IsEnum(TicketDeliveryMethod)
  deliveryMethod?: TicketDeliveryMethod;
}
