import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";

export class CreateSeatZoneDto {
  @IsString()
  name!: string;

  @IsNumber()
  price!: number;

  /** General zone (e.g. standing area): capacity-only, no individual seats. */
  @IsOptional()
  @IsBoolean()
  isGeneral?: boolean;

  /** Required when isGeneral = true. */
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  /** Required when isGeneral is not set — generates rows labeled A, B, C... */
  @IsOptional()
  @IsInt()
  @Min(1)
  rows?: number;

  /** Required when isGeneral is not set — seat numbers 1..seatsPerRow within each row. */
  @IsOptional()
  @IsInt()
  @Min(1)
  seatsPerRow?: number;
}

export class CreateSeatMapDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSeatZoneDto)
  zones!: CreateSeatZoneDto[];
}
