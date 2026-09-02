import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsUUID, Min } from "class-validator";
import { RefundStatus } from "@prisma/client";

export class ListRefundsDto {
  @IsOptional()
  @IsUUID()
  eventId?: string;

  @IsOptional()
  @IsIn(Object.values(RefundStatus))
  status?: RefundStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
