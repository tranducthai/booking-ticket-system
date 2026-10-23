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
  const { data: cfg, isLoading } = useMediaConfig();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Chỉ nhận file ảnh (JPG, PNG, WEBP, GIF)");
      return;
    }
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
  return { loading: isLoading, enabled: cfg?.uploadEnabled ?? false, busy, error, upload };
}

/** Shown instead of the drop zone when event-service has no image storage configured (SUPABASE_* unset). */
function UploadUnavailable() {
  return (
    <div className="px-4 py-6 text-center text-sm text-ink-500">
      Chưa thể tải ảnh lên — máy chủ chưa cấu hình nơi lưu ảnh. Vui lòng liên hệ quản trị viên.
    </div>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7 text-ink-400">
      <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Single image, upload only (Supabase Storage via event-service): click or
 * drag-and-drop a file; the stored value is the resulting public URL.
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
  const { loading, enabled, busy, error, upload } = useImageUpload(kind, onChange);
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
            disabled={busy}
            onClick={() => input.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-1 px-4 py-6 text-sm text-ink-500 hover:bg-ink-50"
          >
            <UploadIcon />
            <span className="font-semibold text-ink-700">Bấm hoặc kéo thả ảnh vào đây</span>
            <span className="text-xs">JPG, PNG, WEBP, GIF</span>
          </button>
        ) : loading ? (
          <div className="px-4 py-6 text-center text-sm text-ink-400">Đang tải…</div>
        ) : (
          <UploadUnavailable />
        )}
        {busy && <div className="bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700">Đang tải ảnh lên…</div>}
      </div>
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

/**
 * Several images (an event's gallery), upload only: a grid of thumbnails,
 * each removable or movable, plus an "add" tile taking one or many files
 * (picked or dropped). The value is the ordered list of public URLs.
 */
export function GalleryField({
  label,
  value,
  onChange,
  kind,
  max = 10,
  hint,
}: {
  label: string;
  value: string[];
  onChange: (urls: string[]) => void;
  kind: MediaKind;
  max?: number;
  hint?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  // Uploads finish one by one; read the latest list through a ref so each appends to it, not to a stale copy.
  const latest = useRef(value);
  latest.current = value;
  const { loading, enabled, busy, error, upload } = useImageUpload(kind, (url) => {
    latest.current = [...latest.current, url];
    onChange(latest.current);
  });
  const [dragging, setDragging] = useState(false);
  const room = max - value.length;

  async function uploadMany(files: File[]) {
    for (const file of files.slice(0, Math.max(0, room))) await upload(file);
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length) return;
    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  return (
    <div>
      <label className="label">
        {label} <span className="font-normal text-ink-400">({value.length}/{max})</span>
      </label>
      <div
        className={`grid grid-cols-3 gap-2 rounded-xl border-2 border-dashed p-2 transition-colors sm:grid-cols-4 ${dragging ? "border-brand-500 bg-brand-50" : "border-ink-200"}`}
        onDragOver={(e) => {
          if (!enabled || room <= 0) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (enabled) void uploadMany(Array.from(e.dataTransfer.files));
        }}
      >
        {value.map((url, i) => (
          <div key={`${url}-${i}`} className="group relative aspect-square overflow-hidden rounded-lg bg-ink-50">
            <img src={url} alt="" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.style.opacity = "0.2")} />
            <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/50 px-1 py-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <span className="flex gap-1">
                <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} className="px-1 text-xs text-white disabled:opacity-30" title="Lên trước">
                  ←
                </button>
                <button type="button" onClick={() => move(i, i + 1)} disabled={i === value.length - 1} className="px-1 text-xs text-white disabled:opacity-30" title="Ra sau">
                  →
                </button>
              </span>
              <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="px-1 text-xs font-semibold text-red-300 hover:text-red-200">
                Xoá
              </button>
            </div>
          </div>
        ))}

        {room > 0 &&
          (enabled ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => input.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg text-center text-xs text-ink-500 hover:bg-ink-50 disabled:opacity-60"
            >
              <UploadIcon />
              <span className="font-semibold text-ink-700">{busy ? "Đang tải…" : "Thêm ảnh"}</span>
              <span>Bấm hoặc kéo thả</span>
            </button>
          ) : value.length === 0 ? (
            <div className="col-span-full">{loading ? <div className="px-4 py-6 text-center text-sm text-ink-400">Đang tải…</div> : <UploadUnavailable />}</div>
          ) : null)}
      </div>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void uploadMany(files);
        }}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </div>
  );
}
