import { Transform, Type } from "class-transformer";
import { IsArray, IsBoolean, IsDate, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min, ValidateNested } from "class-validator";
import { IsAfter, IsFuture, trimString } from "../../common/validators";
import { TicketMode } from "../../generated/prisma";
import { RefundPolicyDto } from "./refund-policy.dto";

export class CreateEventDto {
  /**
   * Admin only: the partner organizer this event is created for — it's owned
   * by them from the start (their dashboard, payouts, refunds), the admin
   * just did the data entry. Ignored when an organizer creates an event.
   */
  @IsOptional()
  @IsUUID()
  organizerId?: string;

  @IsString()
  categoryId!: string;

  @Transform(trimString)
  @IsString()
  @Length(5, 100, { message: "Tên sự kiện từ 5 đến 100 ký tự" })
  title!: string;

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
  @Max(100, { message: "Giới hạn tối đa 100 vé mỗi tài khoản" })
  maxTicketsPerAccount?: number;

  @Transform(trimString)
  @IsString()
  @Length(2, 120, { message: "Tên địa điểm từ 2 đến 120 ký tự" })
  venueName!: string;

  @Transform(trimString)
  @IsString()
  @Length(2, 255, { message: "Địa chỉ từ 2 đến 255 ký tự" })
  venueAddress!: string;

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

  @Type(() => Date)
  @IsDate()
  @IsFuture("Thời gian bắt đầu phải sau thời điểm hiện tại")
  startTime!: Date;

  @Type(() => Date)
  @IsDate()
  @IsAfter("startTime", "Thời gian kết thúc phải sau thời gian bắt đầu")
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
  @IsAfter("salesStartTime", "Thời gian đóng bán phải sau thời gian mở bán")
  salesEndTime?: Date;

  /** Opt in to artist membership-card perks (presale + discount) — schema.prisma Event.memberBenefits. */
  @IsOptional()
  @IsBoolean()
  memberBenefits?: boolean;

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
