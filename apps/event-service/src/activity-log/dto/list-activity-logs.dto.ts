import { Type } from "class-transformer";
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";

/** Same query contract on every service's /activity-logs routes — docs/spec/14-activity-log-design.md §4. */
export class ListActivityLogsDto {
  /** Keyset cursor from a previous page's `nextBefore` (or a row's `cursor`). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 30;

  // Filters — honored everywhere, but mostly useful on the admin view.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  actorId?: string;

  @IsOptional()
  @IsUUID()
  subjectUserId?: string;

  /** Prefix match: "refund" matches refund.requested, refund.approved, ... */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  targetType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  targetId?: string;

  @IsOptional()
  @IsUUID()
  eventId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
