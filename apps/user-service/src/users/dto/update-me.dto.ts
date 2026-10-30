import { Transform, Type } from "class-transformer";
import { IsEnum, IsOptional, IsString, IsUrl, Length, Matches, MaxLength, ValidateIf, Validate, ValidatorConstraint, ValidatorConstraintInterface } from "class-validator";
import { BIRTH_DATE_MESSAGE, isBirthDate, normalizePhone, normalizeText, PERSON_NAME, PERSON_NAME_MESSAGE, VN_PHONE, VN_PHONE_MESSAGE } from "../../common/validators";
import { Gender } from "../../generated/prisma";

@ValidatorConstraint({ name: "birthDate" })
class BirthDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return isBirthDate(value);
  }
}

export class UpdateMeDto {
  @IsOptional()
  @Transform(normalizeText)
  @IsString()
  @Length(2, 100, { message: "Họ tên từ 2 đến 100 ký tự" })
  @Matches(PERSON_NAME, { message: PERSON_NAME_MESSAGE })
  fullName?: string;

  @IsOptional()
  @Transform(normalizePhone)
  @Matches(VN_PHONE, { message: VN_PHONE_MESSAGE })
  phone?: string;

  @IsOptional()
  @IsUrl({ require_tld: false }) // require_tld: false so http://localhost:*/... image URLs still work in local dev
  avatarUrl?: string;

  /** "YYYY-MM-DD"; null clears it. */
  @ValidateIf((o: UpdateMeDto) => o.dateOfBirth !== undefined && o.dateOfBirth !== null)
  @Type(() => Date)
  @Validate(BirthDateConstraint, { message: BIRTH_DATE_MESSAGE })
  dateOfBirth?: Date | null;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(5000, { message: "Thông tin ban tổ chức tối đa 5000 ký tự" })
  organizerDescription?: string;

  /** Số CCCD: đúng 12 chữ số. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.replace(/\s+/g, "") : value))
  @Matches(/^\d{12}$/, { message: "Số CCCD gồm đúng 12 chữ số" })
  nationalId?: string;

  @IsOptional()
  @IsEnum(Gender, { message: "Giới tính không hợp lệ" })
  gender?: Gender | null;
}
