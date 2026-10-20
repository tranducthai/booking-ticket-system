import { IsString, Length } from "class-validator";

export class OAuthExchangeDto {
  /** 64-hex one-time code from the /oauth/callback?code= redirect. */
  @IsString()
  @Length(64, 64)
  code!: string;
}
