/**
 * Input rules for account fields, shared by register / profile / partner
 * DTOs and mirrored in apps/web/src/lib/validation.ts (the server is the one
 * that counts — the web only shows the message earlier).
 */

/** Vietnamese mobile number after normalizePhone: 0 or +84, then a 3/5/7/8/9 carrier prefix and 8 digits. */
export const VN_PHONE = /^(0|\+84)(3|5|7|8|9)\d{8}$/;
export const VN_PHONE_MESSAGE = "Số điện thoại không hợp lệ (số di động Việt Nam, VD: 0912345678)";

/** A person's name: letters (any language, with diacritics), spaces and . ' - — no digits or symbols. */
export const PERSON_NAME = /^\p{L}[\p{L}\s.'-]*$/u;
export const PERSON_NAME_MESSAGE = "Họ tên chỉ gồm chữ cái và khoảng trắng";

/** 8-72 chars (bcrypt ignores bytes past 72), at least one letter and one digit. */
export const PASSWORD = /^(?=.*\p{L})(?=.*\d).{8,72}$/u;
export const PASSWORD_MESSAGE = "Mật khẩu 8–72 ký tự, gồm cả chữ và số";

/** class-transformer: "091 234.5678" -> "0912345678"; "" -> undefined so an emptied optional field isn't rejected. */
export const normalizePhone = ({ value }: { value: unknown }) => {
  if (typeof value !== "string") return value;
  const cleaned = value.replace(/[\s.\-()]/g, "");
  return cleaned === "" ? undefined : cleaned;
};

/** class-transformer: trim and collapse inner whitespace. */
export const normalizeText = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ") : value);

/** A birth date: a real past day, no earlier than 1900. */
export const isBirthDate = (d: unknown) =>
  d instanceof Date && !Number.isNaN(d.getTime()) && d.getTime() < Date.now() && d.getUTCFullYear() >= 1900;
export const BIRTH_DATE_MESSAGE = "Ngày sinh không hợp lệ";
