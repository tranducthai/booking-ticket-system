import { Transform } from "class-transformer";
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import type { RefundReasonCategory } from "@booking-ticket-system/event-contracts";

export const REFUND_REASON_CATEGORIES: RefundReasonCategory[] = ["PERSONAL", "SCHEDULE_CONFLICT", "MEDICAL", "EVENT_ISSUE", "OTHER"];

/** Sent as multipart/form-data (fields + up to 5 `files`) or plain JSON when there's no evidence. */
/**
 * Which tickets (order item ids) — arrives as an array (JSON, or repeated
 * multipart/query fields) or a single comma-separated string.
 */
export const toIdList = ({ value }: { value: unknown }) =>
  value === undefined || value === ""
    ? undefined
    : (Array.isArray(value) ? value : String(value).split(",")).map((v) => String(v).trim()).filter(Boolean);

export class RequestRefundDto {
  @IsUUID()
  orderId!: string;

  /** The tickets to cancel. Omitted = every ticket of the order not already refunded or pending. */
  @IsOptional()
  @Transform(toIdList)
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsUUID("all", { each: true })
  orderItemIds?: string[];

  @IsOptional()
  @IsIn(REFUND_REASON_CATEGORIES)
  reasonCategory?: RefundReasonCategory;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;
}
