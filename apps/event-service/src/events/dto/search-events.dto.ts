import { Type } from "class-transformer";
import { IsDateString, IsInt, IsOptional, IsString, Min } from "class-validator";

export class SearchEventsDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  location?: string;

  /** docs/spec/01-business-analysis.md §3.1 "price range" — matches an event with at least one ticket type or seat zone priced >= this. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPrice?: number;

  /** Matches an event with at least one ticket type or seat zone priced <= this. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;

  /** §3.1 "time" — Event.startTime >= this (ISO date/datetime string). */
  @IsOptional()
  @IsDateString()
  startDateFrom?: string;

  /** Event.startTime <= this. */
  @IsOptional()
  @IsDateString()
  startDateTo?: string;

  /**
   * docs/spec/12-resilience-and-failure-design.md "events.search: drop
   * COUNT(*), use cursor pagination" — opaque, base64(startTime|id) from a
   * previous response's nextCursor. Omit for the first page.
   */
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
