import { IsInt, IsOptional, IsUUID, Min } from "class-validator";

export class HoldSeatDto {
  @IsUUID()
  orderId!: string;

  @IsUUID()
  userId!: string;

  /** Per-user-per-event cap enforcement (docs/spec/12-resilience-and-failure-design.md) — how many seats this hold would bring the user to, including this one. */
  @IsOptional()
  @IsInt()
  @Min(1)
  requestedCount?: number;
}
