import { IsString, MaxLength, MinLength } from "class-validator";

/** The raw scanned QR content — static (TBX2./legacy) or rotating (TBX2D.), see qr-signer.service.ts. */
export class CheckInDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  code!: string;
}
