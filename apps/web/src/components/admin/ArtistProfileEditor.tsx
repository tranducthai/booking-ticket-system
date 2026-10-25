import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { artistsApi } from "../../api/artists";
import { apiErrorMessage } from "../../api/client";
import { check, rules } from "../../lib/validation";
import { ImageField } from "../ui/ImageField";

const SOCIALS = ["facebook", "instagram", "youtube", "spotify", "tiktok"] as const;
const URL_RE = /^https?:\/\/\S+$/i;

/** Admin: what the artist page shows above the tabs — name, avatar, cover, bio, social links. */
export function ArtistProfileEditor({ artistId }: { artistId: string }) {
  const qc = useQueryClient();
  const { data: artist } = useQuery({ queryKey: ["artist", artistId], queryFn: () => artistsApi.getById(artistId) });
  const [form, setForm] = useState({ name: "", avatarUrl: "", coverUrl: "", bio: "", socials: {} as Record<string, string> });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (artist) setForm({ name: artist.name, avatarUrl: artist.avatarUrl ?? "", coverUrl: artist.coverUrl ?? "", bio: artist.bio ?? "", socials: artist.socialLinks ?? {} });
  }, [artist]);

  const save = useMutation({
    mutationFn: () => {
      check(
        rules.length(form.name, "Tên nghệ sĩ", 1, 100),
        form.bio.length > 2000 ? "Giới thiệu tối đa 2000 ký tự" : null,
        ...SOCIALS.map((k) => (form.socials[k] && !URL_RE.test(form.socials[k]) ? `Link ${k} phải bắt đầu bằng http:// hoặc https://` : null)),
      );
      const socialLinks = Object.fromEntries(Object.entries(form.socials).filter(([, v]) => v.trim()));
      return artistsApi.update(artistId, {
        name: form.name.trim(),
        bio: form.bio,
        socialLinks,
        ...(form.avatarUrl ? { avatarUrl: form.avatarUrl } : {}),
        ...(form.coverUrl ? { coverUrl: form.coverUrl } : {}),
      });
    },
    onSuccess: () => {
      setError(null);
      setSaved(true);
      void qc.invalidateQueries({ queryKey: ["artist", artistId] });
      void qc.invalidateQueries({ queryKey: ["artists"] });
    },
    onError: (err) => setError(apiErrorMessage(err, "Không thể lưu hồ sơ nghệ sĩ.")),
  });
  const set = (patch: Partial<typeof form>) => {
    setSaved(false);
    setForm({ ...form, ...patch });
  };

  if (!artist) return <p className="text-sm text-ink-400">Đang tải...</p>;
  return (
    <div className="space-y-4 rounded-xl bg-ink-50 p-4">
      <div>
        <label className="label">Tên nghệ sĩ</label>
        <input value={form.name} maxLength={100} onChange={(e) => set({ name: e.target.value })} className="input" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <ImageField label="Ảnh đại diện" kind="artist" value={form.avatarUrl} onChange={(avatarUrl) => set({ avatarUrl })} previewClassName="mx-auto my-3 h-28 w-28 rounded-full object-cover" />
        <ImageField label="Ảnh bìa (ngang)" kind="banner" value={form.coverUrl} onChange={(coverUrl) => set({ coverUrl })} previewClassName="h-28 w-full object-cover" />
      </div>
      <div>
        <label className="label">Giới thiệu</label>
        <textarea value={form.bio} onChange={(e) => set({ bio: e.target.value })} maxLength={2000} className="input min-h-[90px]" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {SOCIALS.map((k) => (
          <div key={k}>
            <label className="label capitalize">{k}</label>
            <input value={form.socials[k] ?? ""} onChange={(e) => set({ socials: { ...form.socials, [k]: e.target.value } })} className="input" placeholder="https://..." />
          </div>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button onClick={() => save.mutate()} disabled={save.isPending} className="btn-primary">
          {save.isPending ? "Đang lưu..." : "Lưu hồ sơ"}
        </button>
        {saved && <span className="text-sm text-emerald-600">Đã lưu ✓</span>}
      </div>
    </div>
  );
}
