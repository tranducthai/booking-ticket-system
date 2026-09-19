import { Type } from "class-transformer";
import { IsArray, IsDate, IsEnum, IsOptional, IsString } from "class-validator";
import { TicketMode } from "../../generated/prisma";

export class CreateEventDto {
  @IsString()
  categoryId!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  bannerUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  galleryUrls?: string[];

  @IsString()
  venueName!: string;

  @IsString()
  venueAddress!: string;

  @Type(() => Date)
  @IsDate()
  startTime!: Date;

  @Type(() => Date)
  @IsDate()
  endTime!: Date;

  @IsEnum(TicketMode)
  ticketMode!: TicketMode;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  salesStartTime?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  salesEndTime?: Date;
}
