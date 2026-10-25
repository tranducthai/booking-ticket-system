import { Transform } from "class-transformer";
import { IsEmail, IsOptional, IsString, IsUrl, Length, Matches, MaxLength } from "class-validator";
import { normalizePhone, normalizeText, PASSWORD, PASSWORD_MESSAGE, VN_PHONE, VN_PHONE_MESSAGE } from "../../common/validators";

/** POST /users/partners — an admin onboards a partner organizer directly (no self-signup + "promote" round trip). */
export class CreatePartnerDto {
  @Transform(normalizeText)
  @IsEmail({}, { message: "Email không đúng định dạng" })
  @MaxLength(254)
  email!: string;

  /** The brand/company name shown as the organizer, e.g. "VNStage Live" — digits/symbols allowed, unlike a person's name. */
  @Transform(normalizeText)
  @IsString()
  @Length(2, 120, { message: "Tên đối tác từ 2 đến 120 ký tự" })
  fullName!: string;

  /** Initial password, handed to the partner out of band — same rule as self-registration. */
  @IsString()
  @Matches(PASSWORD, { message: PASSWORD_MESSAGE })
  password!: string;

  @IsOptional()
  @Transform(normalizePhone)
  @Matches(VN_PHONE, { message: VN_PHONE_MESSAGE })
  phone?: string;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;
}
