import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, Max, Min, ValidateNested } from "class-validator";
import type { RefundReasonCategory } from "@booking-ticket-system/event-contracts";

const REASON_CATEGORIES: RefundReasonCategory[] = ["PERSONAL", "SCHEDULE_CONFLICT", "MEDICAL", "EVENT_ISSUE", "OTHER"];

export class RefundPolicyTierDto {
  @IsInt()
  @Min(0)
  minHoursBefore!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  percent!: number;
}

/** Validated shape of Event.refundPolicy — see RefundPolicy in libs/event-contracts. */
export class RefundPolicyDto {
  @IsBoolean()
  customerRefundable!: boolean;

  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => RefundPolicyTierDto)
  tiers!: RefundPolicyTierDto[];

  @IsOptional()
  @IsArray()
  @IsIn(REASON_CATEGORIES, { each: true })
  evidenceRequiredFor?: RefundReasonCategory[];

  /** Approve eligible customer requests automatically (see RefundPolicy.autoApprove). */
  @IsOptional()
  @IsBoolean()
  autoApprove?: boolean;
}
