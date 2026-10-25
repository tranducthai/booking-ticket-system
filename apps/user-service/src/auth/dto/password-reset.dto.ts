import { Transform } from "class-transformer";
import { IsEmail, IsString, Length, Matches } from "class-validator";
import { normalizeText, PASSWORD, PASSWORD_MESSAGE } from "../../common/validators";

export class ForgotPasswordDto {
  @Transform(normalizeText)
  @IsEmail({}, { message: "Email không đúng định dạng" })
  email!: string;
}

export class ResetPasswordDto {
  /** The raw token from the emailed link (64 hex chars). */
  @IsString()
  @Length(64, 64)
  token!: string;

  @IsString()
  @Matches(PASSWORD, { message: PASSWORD_MESSAGE })
  newPassword!: string;
}
