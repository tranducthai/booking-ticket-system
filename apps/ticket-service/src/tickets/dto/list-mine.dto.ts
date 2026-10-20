import { Type } from "class-transformer";
import { IsInt, IsOptional, IsUUID, Min } from "class-validator";

export class ListMineDto {
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

  /** Only tickets of this event — the order page's per-ticket refund picker. */
  @IsOptional()
  @IsUUID()
  eventId?: string;
}
