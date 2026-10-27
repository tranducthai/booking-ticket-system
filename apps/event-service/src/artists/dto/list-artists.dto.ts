import { Type } from "class-transformer";
import { IsBooleanString, IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";

export class ListArtistsDto {
  /** Name search, for organizers picking an existing artist when building a lineup. */
  @IsOptional()
  @IsString()
  q?: string;

  /** "true" -> verified only (the homepage carousel/directory); omitted -> everyone, including the organizer-picker use case. */
  @IsOptional()
  @IsBooleanString()
  verified?: string;

  @IsOptional()
  @IsIn(["PENDING", "APPROVED", "REJECTED"])
  status?: "PENDING" | "APPROVED" | "REJECTED";

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
