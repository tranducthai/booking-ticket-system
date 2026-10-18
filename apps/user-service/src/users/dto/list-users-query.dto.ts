import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";

export class ListUsersQueryDto {
  @IsOptional()
  @IsIn(["CUSTOMER", "ORGANIZER", "ADMIN"])
  role?: "CUSTOMER" | "ORGANIZER" | "ADMIN";

  /** Case-insensitive match on email, name or phone. */
  @IsOptional()
  @IsString()
  q?: string;

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
