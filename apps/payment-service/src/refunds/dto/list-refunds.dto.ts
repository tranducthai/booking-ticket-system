import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsUUID, Min } from "class-validator";
import { RefundStatus } from "../../generated/prisma";

export class ListRefundsDto {
  /** Required for organizers (must be one of their own events); optional for admins. */
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

export class ListMyRefundsDto {
  @IsOptional()
  @IsUUID()
  orderId?: string;
}
