import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import type { RefundReasonCategory } from "@booking-ticket-system/event-contracts";

export const REFUND_REASON_CATEGORIES: RefundReasonCategory[] = ["PERSONAL", "SCHEDULE_CONFLICT", "MEDICAL", "EVENT_ISSUE", "OTHER"];

/** Sent as multipart/form-data (fields + up to 5 `files`) or plain JSON when there's no evidence. */
export class RequestRefundDto {
  @IsUUID()
  orderId!: string;

  @IsOptional()
  @IsIn(REFUND_REASON_CATEGORIES)
  reasonCategory?: RefundReasonCategory;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;
}
