import { IsObject, IsOptional, IsString } from "class-validator";

export class UpdateArtistDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsObject()
  socialLinks?: Record<string, string>;
}
