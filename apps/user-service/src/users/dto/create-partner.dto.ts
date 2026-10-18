import { IsEmail, IsOptional, IsString, IsUrl, MaxLength, MinLength } from "class-validator";

/** POST /users/partners — an admin onboards a partner organizer directly (no self-signup + "promote" round trip). */
export class CreatePartnerDto {
  @IsEmail()
  email!: string;

  /** The brand/company name shown as the organizer, e.g. "VNStage Live". */
  @IsString()
  @MaxLength(120)
  fullName!: string;

  /** Initial password, handed to the partner out of band — same rule as self-registration. */
  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;
}
