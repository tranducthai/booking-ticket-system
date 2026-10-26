import { Type } from "class-transformer";
import { IsDate, IsIn, IsOptional, IsUUID } from "class-validator";

export class OrganizerStatsQueryDto {
  /** One of the organizer's events; omitted = all of them. */
  @IsOptional()
  @IsUUID()
  eventId?: string;

  /** Inclusive start of the range; omitted = from the beginning. */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  /** Exclusive end of the range; omitted = now. */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  /** Granularity of the time series. */
  @IsOptional()
  @IsIn(["hour", "day", "month"])
  bucket?: "hour" | "day" | "month";
}
