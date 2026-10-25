import { Transform, Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateNested } from "class-validator";
import { MAX_PRICE, trimString } from "../../common/validators";

/** One seat's cell on the hall canvas — 0-based, row 0 is nearest the stage. */
export class SeatCellDto {
  @IsInt()
  @Min(0)
  r!: number;

  @IsInt()
  @Min(0)
  c!: number;
}

/** The hall canvas from the web's seat-map designer. When present, seated zones are drawn with `cells`, not rows x seatsPerRow. */
export class SeatCanvasDto {
  @IsInt()
  @Min(1)
  @Max(60)
  rows!: number;

  @IsInt()
  @Min(1)
  @Max(80)
  cols!: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  stageLabel?: string;
}

export class CreateSeatZoneDto {
  @Transform(trimString)
  @IsString()
  @Length(1, 60, { message: "Tên khu từ 1 đến 60 ký tự" })
  name!: string;

  @IsOptional()
  @Matches(/^#[0-9a-f]{6}$/i, { message: "color must be #rrggbb" })
  color?: string;

  /** Canvas mode: the cells this zone's seats occupy. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4800)
  @ValidateNested({ each: true })
  @Type(() => SeatCellDto)
  cells?: SeatCellDto[];

  @IsNumber()
  @Min(0, { message: "Giá vé không được âm" })
  @Max(MAX_PRICE)
  price!: number;

  /** General zone (e.g. standing area): capacity-only, no individual seats. */
  @IsOptional()
  @IsBoolean()
  isGeneral?: boolean;

  /** Required when isGeneral = true. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000, { message: "Sức chứa tối đa 100.000" })
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
  @IsOptional()
  @ValidateNested()
  @Type(() => SeatCanvasDto)
  canvas?: SeatCanvasDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSeatZoneDto)
  zones!: CreateSeatZoneDto[];
}
