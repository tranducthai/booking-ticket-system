import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, Max, Min, ValidateNested } from "class-validator";


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

  /** Approve eligible customer requests automatically (see RefundPolicy.autoApprove). */
  @IsOptional()
  @IsBoolean()
  autoApprove?: boolean;
}
