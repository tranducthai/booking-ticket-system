import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Min } from "class-validator";

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
