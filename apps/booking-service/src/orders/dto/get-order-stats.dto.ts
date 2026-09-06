import { Type } from "class-transformer";
import { IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";

export class GetOrderStatsDto {
  /** Omitted -> system-wide stats (admin only, see OrdersController.stats). */
  @IsOptional()
  @IsUUID()
  eventId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number = 30;
}
