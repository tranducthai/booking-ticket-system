import { Type } from "class-transformer";
import { ArrayMinSize, IsInt, IsOptional, IsUUID, Min, ValidateNested } from "class-validator";

export class HoldCartItemDto {
  /** Set for General Admission — mutually exclusive with seatId (docs/spec/07-database-schema.md §3 CHECK constraint). */
  @IsOptional()
  @IsUUID()
  ticketTypeId?: string;

  /** Set for Seat Map. */
  @IsOptional()
  @IsUUID()
  seatId?: string;

  /** Only meaningful with ticketTypeId — seat items are always quantity 1. */
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}

export class HoldCartDto {
  @IsUUID()
  eventId!: string;

  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => HoldCartItemDto)
  items!: HoldCartItemDto[];
}
