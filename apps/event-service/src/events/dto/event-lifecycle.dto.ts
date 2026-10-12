import { Type } from "class-transformer";
import { IsDate, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/** docs/spec/13-refund-and-anti-fraud-design.md §2.3 — organizer asks admin to cancel their event. */
export class RequestCancelEventDto {
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  reason!: string;
}

/** Admin cancels directly, or approves a pending request (reason defaults to the organizer's). */
export class CancelEventDto {
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  reason?: string;
}

export class RejectCancelRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;
}

/** §2.4 — moves the event; holders get a 100% refund window. */
export class PostponeEventDto {
  @Type(() => Date)
  @IsDate()
  startTime!: Date;

  @Type(() => Date)
  @IsDate()
  endTime!: Date;
}
