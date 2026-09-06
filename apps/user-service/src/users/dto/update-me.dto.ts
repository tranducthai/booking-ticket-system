import { IsOptional, IsString, IsUrl } from "class-validator";

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsUrl({ require_tld: false }) // require_tld: false so http://localhost:*/... image URLs still work in local dev
  avatarUrl?: string;
}
