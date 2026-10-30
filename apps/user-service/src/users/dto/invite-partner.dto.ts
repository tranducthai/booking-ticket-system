import { Transform } from "class-transformer";
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength } from "class-validator";
import { normalizePhone, normalizeText, PASSWORD, PASSWORD_MESSAGE, VN_PHONE, VN_PHONE_MESSAGE } from "../../common/validators";

/** POST /partner-invites — an admin invites a partner organizer by email; the account is created only when they set a password. */
export class InvitePartnerDto {
  @Transform(normalizeText)
  @IsEmail({}, { message: "Email không đúng định dạng" })
  @MaxLength(254)
  email!: string;

  /** The brand/company name shown as the organizer, e.g. "VNStage Live" — digits/symbols allowed, unlike a person's name. */
  @Transform(normalizeText)
  @IsString()
  @Length(2, 120, { message: "Tên đối tác từ 2 đến 120 ký tự" })
  fullName!: string;

  @IsOptional()
  @Transform(normalizePhone)
  @Matches(VN_PHONE, { message: VN_PHONE_MESSAGE })
  phone?: string;
}

/** POST /partner-invites/accept — the invitee sets their password from the emailed link. */
export class AcceptPartnerInviteDto {
  @IsString()
  @MaxLength(200)
  token!: string;

  @IsString()
  @Matches(PASSWORD, { message: PASSWORD_MESSAGE })
  password!: string;
}
