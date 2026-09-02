import { IsUUID } from "class-validator";

/** Shared by release/confirm/extend-hold — all three need to know which order owns the hold, and which user's per-event hold-count set to update. */
export class ReleaseSeatDto {
  @IsUUID()
  orderId!: string;

  @IsUUID()
  userId!: string;
}
