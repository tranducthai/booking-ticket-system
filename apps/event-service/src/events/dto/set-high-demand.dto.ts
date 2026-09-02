import { IsBoolean } from "class-validator";

export class SetHighDemandDto {
  @IsBoolean()
  enabled!: boolean;
}
