import { IsBoolean } from "class-validator";

export class LockUserDto {
  @IsBoolean()
  isLocked!: boolean;
}
