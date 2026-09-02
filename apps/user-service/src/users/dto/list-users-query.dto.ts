import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, Min } from "class-validator";

export class ListUsersQueryDto {
  @IsOptional()
  @IsIn(["CUSTOMER", "ORGANIZER", "ADMIN"])
  role?: "CUSTOMER" | "ORGANIZER" | "ADMIN";

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
