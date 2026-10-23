import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsDate, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from "class-validator";
import { RefundPolicyDto } from "./refund-policy.dto";

export class UpdateEventDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  /** Rich-text HTML from the web editor — sanitized server-side before it's stored (common/rich-text-sanitizer.ts). */
  @IsOptional()
  @IsString()
  @MaxLength(100_000)
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

  @IsOptional()
  @IsString()
  venueName?: string;

  @IsOptional()
  @IsString()
  venueAddress?: string;

  /** Event-creation wizard address — see schema.prisma Event.isOnline/province/ward/streetAddress. */
  @IsOptional()
  @IsBoolean()
  isOnline?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  province?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  ward?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  streetAddress?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startTime?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endTime?: Date;

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

  /** Image URL of the venue's ticket-zone map, shown above the ticket tiers. */
  @IsOptional()
  @IsString()
  zoneMapUrl?: string;

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
