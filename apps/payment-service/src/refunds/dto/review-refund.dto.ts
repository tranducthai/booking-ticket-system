import { Transform, Type } from "class-transformer";
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from "class-validator";
import { toIdList } from "./request-refund.dto";

export class ApproveRefundDto {
  /** Optional override — may only RAISE the policy's percent (a goodwill gesture), never lower it. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  percent?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

/** Shared by reject (reason shown to the customer), need-info (what to provide), escalate and respond (customer's note). */
export class RefundMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;
}

export class OptionalRefundMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}

export class QuoteRefundDto {
  @IsUUID()
  orderId!: string;

  @IsOptional()
  @IsString()
  reasonCategory?: string;

  /** Same as RequestRefundDto.orderItemIds — the quote is for exactly these tickets. */
  @IsOptional()
  @Transform(toIdList)
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsUUID("all", { each: true })
  orderItemIds?: string[];
}
