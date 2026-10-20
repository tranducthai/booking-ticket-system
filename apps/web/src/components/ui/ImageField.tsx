import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { apiErrorMessage } from "../../api/client";
import { MediaKind, mediaApi } from "../../api/media";

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

export function useMediaConfig() {
  return useQuery({ queryKey: ["media-config"], queryFn: mediaApi.config, staleTime: Infinity, retry: false });
}

/**
 * Hook behind both upload widgets: validates size client-side, uploads,
 * hands back the CDN URL. The server re-checks size and sniffs the bytes.
 */
function useImageUpload(kind: MediaKind, onUploaded: (url: string) => void) {
  const { data: cfg } = useMediaConfig();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    if (cfg && file.size > cfg.maxBytes) {
      setError(`Ảnh tối đa ${Math.round(cfg.maxBytes / 1024 / 1024)}MB`);
      return;
    }
    setBusy(true);
    try {
      onUploaded(await mediaApi.uploadImage(file, kind));
    } catch (err) {
      setError(apiErrorMessage(err, "Tải ảnh lên thất bại"));
    } finally {
      setBusy(false);
    }
  }
  return { enabled: cfg?.uploadEnabled ?? false, busy, error, upload };
}

/**
 * Image input: upload a file (Supabase Storage) or paste a URL — both end up
 * as the same string value, so the form/DTO doesn't care which was used.
 */
export function ImageField({
  label,
  value,
  onChange,
  kind,
  hint,
  previewClassName = "h-32 w-full object-cover",
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  kind: MediaKind;
  hint?: string;
  previewClassName?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { enabled, busy, error, upload } = useImageUpload(kind, onChange);
  const [dragging, setDragging] = useState(false);

  return (
    <div>
      <label className="label">{label}</label>
      <div
        className={`overflow-hidden rounded-xl border-2 border-dashed transition-colors ${dragging ? "border-brand-500 bg-brand-50" : "border-ink-200"}`}
        onDragOver={(e) => {
          if (!enabled) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (enabled && file) void upload(file);
        }}
      >
        {value ? (
          <div className="relative bg-ink-50">
            <img src={value} alt="" className={`${previewClassName} block`} onError={(e) => (e.currentTarget.style.opacity = "0.2")} />
            <div className="absolute right-2 top-2 flex gap-1.5">
              {enabled && (
                <button type="button" onClick={() => input.current?.click()} className="rounded-md bg-white/90 px-2 py-1 text-xs font-semibold text-ink-700 shadow hover:bg-white">
                  Đổi ảnh
                </button>
              )}
              <button type="button" onClick={() => onChange("")} className="rounded-md bg-white/90 px-2 py-1 text-xs font-semibold text-red-600 shadow hover:bg-white">
                Xoá
              </button>
            </div>
          </div>
        ) : enabled ? (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-1 px-4 py-6 text-sm text-ink-500 hover:bg-ink-50"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7 text-ink-400">
              <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="font-semibold text-ink-700">Bấm hoặc kéo thả ảnh vào đây</span>
            <span className="text-xs">JPG, PNG, WEBP, GIF</span>
          </button>
        ) : null}
        {busy && <div className="bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700">Đang tải ảnh lên…</div>}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input mt-2"
        placeholder={enabled ? "…hoặc dán đường dẫn ảnh https://..." : "https://..."}
      />
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </div>
  );
}

/** "+ Tải ảnh lên" button for list-style fields (gallery): each upload appends a URL. */
export function ImageUploadButton({ kind, onUploaded, label = "+ Tải ảnh lên" }: { kind: MediaKind; onUploaded: (url: string) => void; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const { enabled, busy, error, upload } = useImageUpload(kind, onUploaded);
  if (!enabled) return null;
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className="text-xs font-semibold text-brand-600 hover:underline disabled:opacity-50">
        {busy ? "Đang tải…" : label}
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          for (const f of files) await upload(f);
        }}
      />
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
