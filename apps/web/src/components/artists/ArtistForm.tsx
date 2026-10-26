import type { Artist } from "../../api/types";
import { rules } from "../../lib/validation";
import { AvatarUpload } from "../ui/AvatarUpload";
import { ImageField } from "../ui/ImageField";

export const SOCIAL_NETWORKS = [
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "youtube", label: "YouTube" },
  { key: "spotify", label: "Spotify" },
  { key: "tiktok", label: "TikTok" },
] as const;
const URL_RE = /^https?:\/\/\S+$/i;

export interface ArtistFormValue {
  name: string;
  avatarUrl: string;
  coverUrl: string;
  bio: string;
  socials: Record<string, string>;
}

export const EMPTY_ARTIST: ArtistFormValue = { name: "", avatarUrl: "", coverUrl: "", bio: "", socials: {} };

export function artistToForm(a: Artist): ArtistFormValue {
  return { name: a.name, avatarUrl: a.avatarUrl ?? "", coverUrl: a.coverUrl ?? "", bio: a.bio ?? "", socials: a.socialLinks ?? {} };
}

/** First problem with the form, or null — mirrors event-service's CreateArtistDto / IsSocialLinks. */
export function artistFormError(f: ArtistFormValue): string | null {
  return (
    rules.length(f.name, "Tên nghệ sĩ", 1, 100) ??
    (f.bio.length > 2000 ? "Giới thiệu tối đa 2000 ký tự" : null) ??
    SOCIAL_NETWORKS.map(({ key, label }) => (f.socials[key]?.trim() && !URL_RE.test(f.socials[key].trim()) ? `Link ${label} phải bắt đầu bằng http:// hoặc https://` : null)).find(Boolean) ??
    null
  );
}

/** Request body: empty fields left out (an unset image stays unset rather than "" failing URL validation). */
export function artistPayload(f: ArtistFormValue) {
  const socialLinks = Object.fromEntries(Object.entries(f.socials).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
  return {
    name: f.name.trim(),
    bio: f.bio.trim(),
    socialLinks,
    ...(f.avatarUrl ? { avatarUrl: f.avatarUrl } : {}),
    ...(f.coverUrl ? { coverUrl: f.coverUrl } : {}),
  };
}

/**
 * The artist profile fields — name, avatar, cover, bio, social links. Shared by
 * the organizer's "Tạo nghệ sĩ mới" (lineup) and the admin profile editor.
 */
export function ArtistFields({ value, onChange }: { value: ArtistFormValue; onChange: (v: ArtistFormValue) => void }) {
  const set = (patch: Partial<ArtistFormValue>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-4">
      <div>
        <label className="label">
          <span className="mr-0.5 text-red-500">*</span>Tên nghệ sĩ
        </label>
        <input value={value.name} maxLength={100} onChange={(e) => set({ name: e.target.value })} className="input" placeholder="VD: Hà Anh Tuấn, Ban nhạc Ngọt" />
      </div>
      <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
        <AvatarUpload label="Ảnh đại diện" kind="artist" value={value.avatarUrl} onChange={(avatarUrl) => set({ avatarUrl })} />
        <ImageField
          label="Ảnh bìa"
          kind="banner"
          value={value.coverUrl}
          onChange={(coverUrl) => set({ coverUrl })}
          hint="Khuyến nghị tỉ lệ 5:1"
          previewClassName="aspect-[5/1] w-full object-cover"
        />
      </div>
      <div>
        <label className="label">Giới thiệu</label>
        <textarea
          value={value.bio}
          onChange={(e) => set({ bio: e.target.value })}
          maxLength={2000}
          className="input min-h-[240px]"
          placeholder="Phong cách âm nhạc, các sản phẩm nổi bật, giải thưởng..."
        />
        <p className="mt-1 text-right text-xs text-ink-400">{value.bio.length} / 2000</p>
      </div>
      <div>
        <p className="label">Mạng xã hội</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {SOCIAL_NETWORKS.map(({ key, label }) => (
            <div key={key}>
              <label className="mb-1 block text-xs font-semibold text-ink-500">{label}</label>
              <input
                value={value.socials[key] ?? ""}
                onChange={(e) => set({ socials: { ...value.socials, [key]: e.target.value } })}
                className="input"
                placeholder="https://..."
                inputMode="url"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
