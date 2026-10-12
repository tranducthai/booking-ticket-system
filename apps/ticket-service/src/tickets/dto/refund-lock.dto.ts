import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from "class-validator";

export class RefundLockDto {
  @IsUUID()
  refundId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID("all", { each: true })
  orderItemIds!: string[];
}

export class RefundUnlockDto {
  @IsUUID()
  refundId!: string;
}
