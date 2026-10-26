import { useRef, useState } from "react";
import type { MediaKind } from "../../api/media";
import { useImageUpload } from "./ImageField";

/**
 * A profile-picture upload as a round (or square) block instead of a wide
 * drop zone: click or drop an image on it; the picture fills the block.
 */
export function AvatarUpload({
  label,
  value,
  onChange,
  kind,
  hint,
  shape = "circle",
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  kind: MediaKind;
  hint?: string;
  shape?: "circle" | "square";
}) {
  const input = useRef<HTMLInputElement>(null);
  const { enabled, busy, error, upload } = useImageUpload(kind, onChange);
  const [dragging, setDragging] = useState(false);
  const rounded = shape === "circle" ? "rounded-full" : "rounded-2xl";

  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-center gap-4">
        <button
          type="button"
          disabled={!enabled || busy}
          onClick={() => input.current?.click()}
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
          title={enabled ? "Bấm hoặc kéo thả ảnh vào đây" : "Máy chủ chưa cấu hình nơi lưu ảnh"}
          className={`relative flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden border-2 border-dashed transition-colors ${rounded} ${
            dragging ? "border-brand-500 bg-brand-50" : "border-ink-200 bg-ink-50 hover:border-ink-300"
          } disabled:cursor-not-allowed`}
        >
          {value ? (
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-1 text-ink-400">
              <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" aria-hidden>
                <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-xs font-semibold">Tải ảnh lên</span>
            </span>
          )}
          {busy && (
            <span className="absolute inset-0 flex items-center justify-center bg-white/70">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            </span>
          )}
        </button>
        <div className="space-y-2 text-sm">
          {value && (
            <div className="flex gap-3 font-semibold">
              <button type="button" onClick={() => input.current?.click()} disabled={!enabled || busy} className="text-brand-600 hover:underline">
                Đổi ảnh
              </button>
              <button type="button" onClick={() => onChange("")} className="text-red-600 hover:underline">
                Xoá
              </button>
            </div>
          )}
          {hint && <p className="text-xs text-ink-400">{hint}</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
