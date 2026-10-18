import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDate, IsOptional, IsUUID, ValidateNested } from "class-validator";

export class ShowtimeSlotDto {
  @Type(() => Date)
  @IsDate()
  startTime!: Date;

  @Type(() => Date)
  @IsDate()
  endTime!: Date;
}

/** POST /events/:eventId/showtimes — one or many performances at once (e.g. "every evening 14–31/10"). */
export class CreateShowtimesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(120)
  @ValidateNested({ each: true })
  @Type(() => ShowtimeSlotDto)
  items!: ShowtimeSlotDto[];

  /** Copy this showtime's ticket types (name, price, quantity, perks, limits) onto every new one. */
  @IsOptional()
  @IsUUID()
  copyTicketTypesFrom?: string;
}
