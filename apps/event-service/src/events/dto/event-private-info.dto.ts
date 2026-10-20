import { IsIn, IsOptional, IsString, IsUrl, Matches, MaxLength, ValidateIf } from "class-validator";

/**
 * PUT /events/:id/private-info — what only the organizer and admins ever see
 * (never on a public read): the online join link, which ticket holders get on
 * their ticket page, and where the organizer wants the sales money paid out
 * plus the VAT-invoice ("hoá đơn đỏ") details. Every field is optional so each
 * wizard step can save what it owns; "" clears a field.
 */
export class EventPrivateInfoDto {
  @IsOptional()
  @ValidateIf((_o, v) => v !== "")
  @IsUrl({ require_protocol: true, protocols: ["http", "https"] }, { message: "Link tham gia phải là URL http(s) hợp lệ" })
  @MaxLength(500)
  onlineUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  payoutAccountHolder?: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== "")
  @Matches(/^[0-9]{6,20}$/, { message: "Số tài khoản chỉ gồm 6–20 chữ số" })
  payoutAccountNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  payoutBankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  payoutBankBranch?: string;

  @IsOptional()
  @IsIn(["INDIVIDUAL", "COMPANY"])
  invoiceBusinessType?: "INDIVIDUAL" | "COMPANY";

  @IsOptional()
  @IsString()
  @MaxLength(100)
  invoiceName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  invoiceAddress?: string;

  /** Vietnamese tax code: 10 digits, or 13 as "0123456789-001". */
  @IsOptional()
  @ValidateIf((_o, v) => v !== "")
  @Matches(/^[0-9]{10}(-[0-9]{3})?$/, { message: "Mã số thuế gồm 10 chữ số (hoặc dạng 0123456789-001)" })
  invoiceTaxCode?: string;
}
