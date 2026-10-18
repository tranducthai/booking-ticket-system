import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { EventStatus } from "../../generated/prisma";

/** GET /events/admin — every event regardless of status, for the admin console. */
export class AdminListEventsDto {
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  /** Case-insensitive match on title or venue name. */
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  organizerId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
