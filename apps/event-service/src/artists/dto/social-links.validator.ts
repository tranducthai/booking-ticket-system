import { registerDecorator, ValidationOptions } from "class-validator";

export const SOCIAL_KEYS = ["facebook", "instagram", "youtube", "spotify", "tiktok"] as const;
const URL_RE = /^https?:\/\/\S+$/i;

/** Artist.socialLinks: only the known networks, each an http(s) URL of sane length. */
export function IsSocialLinks(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: "isSocialLinks",
      target: object.constructor,
      propertyName,
      options: { message: "Link mạng xã hội không hợp lệ (facebook, instagram, youtube, spotify, tiktok — bắt đầu bằng http:// hoặc https://)", ...options },
      validator: {
        validate(value: unknown) {
          if (value == null) return true;
          if (typeof value !== "object" || Array.isArray(value)) return false;
          return Object.entries(value as Record<string, unknown>).every(
            ([k, v]) => (SOCIAL_KEYS as readonly string[]).includes(k) && typeof v === "string" && v.length <= 300 && URL_RE.test(v),
          );
        },
      },
    });
}
