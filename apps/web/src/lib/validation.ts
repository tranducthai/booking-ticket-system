/**
 * Client-side form checks — the same rules the backend enforces
 * (user-service common/validators.ts, event-service common/validators.ts and
 * the DTOs), shown before a round trip. The server stays the authority.
 *
 * Each rule returns an error message or null. `check()` throws the first
 * one as a FormError, which apiErrorMessage() (api/client.ts) displays
 * like a server error — so a form only needs `check(...)` at the top of its
 * mutationFn.
 */

export class FormError extends Error {}

export function check(...errors: Array<string | null | undefined | false>): void {
  const first = errors.find((e): e is string => typeof e === "string" && e.length > 0);
  if (first) throw new FormError(first);
}

export const VN_PHONE = /^(0|\+84)(3|5|7|8|9)\d{8}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PERSON_NAME = /^\p{L}[\p{L}\s.'-]*$/u;
const PASSWORD = /^(?=.*\p{Lu})(?=.*\d).{12,72}$/u;

/** "091 234.5678" -> "0912345678" — what the backend stores. */
export function normalizePhone(value: string): string {
  return value.replace(/[\s.\-()]/g, "");
}

export const rules = {
  required: (value: string, label: string) => (value.trim() ? null : `Vui lòng nhập ${label}`),

  length: (value: string, label: string, min: number, max: number) => {
    const n = value.trim().length;
    return n < min || n > max ? `${label} từ ${min} đến ${max} ký tự` : null;
  },

  email: (value: string) => (EMAIL.test(value.trim()) && value.trim().length <= 254 ? null : "Email không đúng định dạng"),

  /** Optional unless `required`: empty passes. */
  phone: (value: string, required = false) => {
    const v = normalizePhone(value);
    if (!v) return required ? "Vui lòng nhập số điện thoại" : null;
    return VN_PHONE.test(v) ? null : "Số điện thoại không hợp lệ";
  },

  personName: (value: string) => {
    const v = value.trim().replace(/\s+/g, " ");
    if (v.length < 2 || v.length > 100) return "Họ tên từ 2 đến 100 ký tự";
    return PERSON_NAME.test(v) ? null : "Họ tên chỉ gồm chữ cái và khoảng trắng";
  },

  password: (value: string) => (PASSWORD.test(value) ? null : "Mật khẩu ít nhất 12 ký tự, có chữ hoa và số"),

  confirm: (value: string, original: string) => (value === original ? null : "Mật khẩu nhập lại không khớp"),

  /** Whole number in [min, max]; `optional` lets "" through. */
  int: (value: string, label: string, min: number, max: number, optional = false) => {
    if (value === "" && optional) return null;
    const n = Number(value);
    if (value === "" || !Number.isInteger(n)) return `${label} phải là số nguyên`;
    if (n < min || n > max) return `${label} từ ${min.toLocaleString("vi-VN")} đến ${max.toLocaleString("vi-VN")}`;
    return null;
  },

  /** VND amount: whole number, 0..1 tỷ by default. */
  money: (value: string, label: string, min = 0, max = 1_000_000_000) => {
    const n = Number(value);
    if (value === "" || !Number.isFinite(n)) return `Vui lòng nhập ${label}`;
    if (!Number.isInteger(n)) return `${label} phải là số nguyên (đồng)`;
    if (n < min) return min === 0 ? `${label} không được âm` : `${label} tối thiểu ${min.toLocaleString("vi-VN")}đ`;
    if (n > max) return `${label} tối đa ${max.toLocaleString("vi-VN")}đ`;
    return null;
  },

  /** A datetime-local value that must be later than now. */
  future: (value: string, label: string) => {
    if (!value) return `Vui lòng chọn ${label}`;
    return new Date(value).getTime() > Date.now() ? null : `${label} phải sau thời điểm hiện tại`;
  },

  /** `later` must be strictly after `earlier` (skipped if either is empty). */
  after: (later: string, earlier: string, message: string) =>
    later && earlier && new Date(later).getTime() <= new Date(earlier).getTime() ? message : null,

  maxSpanDays: (start: string, end: string, days: number, message: string) =>
    start && end && new Date(end).getTime() - new Date(start).getTime() > days * 86_400_000 ? message : null,
};

/** `min` for <input type="datetime-local"> — the browser then won't offer past dates. */
export function nowForInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** onChange filter for numeric-only text inputs (phone, account number...). */
export const digitsOnly = (value: string, allowPlus = false) => value.replace(allowPlus ? /[^\d+]/g : /\D/g, "");
