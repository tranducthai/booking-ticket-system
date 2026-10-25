import { Type } from "class-transformer";
import { IsDate, ValidateIf } from "class-validator";

export class SetLateSalesDto {
  /** Reopen unsold tickets until this time; null closes late sales again. */
  @ValidateIf((o: SetLateSalesDto) => o.until !== null)
  @Type(() => Date)
  @IsDate({ message: "Thời gian không hợp lệ" })
  until!: Date | null;
}
