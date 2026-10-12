import { Type } from "class-transformer";
import { IsArray, IsDate, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from "class-validator";
import { TicketMode } from "../../generated/prisma";
import { RefundPolicyDto } from "./refund-policy.dto";

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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxTicketsPerAccount?: number;

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

  /** "Ban tổ chức" section of the event page — see schema.prisma Event.organizerName. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  organizerName?: string;

  @IsOptional()
  @IsString()
  organizerLogoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  organizerDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  terms?: string;

  /** null clears it (all ages). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(99)
  minAge?: number | null;

  /** docs/spec/13-refund-and-anti-fraud-design.md §2.1 — null means "no customer-initiated refunds" (DEFAULT_REFUND_POLICY). Locked once the event leaves DRAFT/REJECTED. */
  @IsOptional()
  @ValidateNested()
  @Type(() => RefundPolicyDto)
  refundPolicy?: RefundPolicyDto;
}
