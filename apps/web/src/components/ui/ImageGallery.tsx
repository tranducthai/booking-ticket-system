import { useCallback, useEffect, useState } from "react";

/** A grid of thumbnails; clicking one opens it full-size in a lightbox you can page through (buttons, ← →, Esc, click outside). */
export function ImageGallery({ urls, alt = "" }: { urls: string[]; alt?: string }) {
  const [current, setCurrent] = useState<number | null>(null);
  const count = urls.length;
  const close = useCallback(() => setCurrent(null), []);
  const step = useCallback((d: number) => setCurrent((i) => (i === null ? i : (i + d + count) % count)), [count]);

  useEffect(() => {
    if (current === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [current, close, step]);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {urls.map((url, i) => (
          <button key={url} type="button" onClick={() => setCurrent(i)} className="group overflow-hidden rounded-xl" aria-label={`Xem ảnh ${i + 1}`}>
            <img src={url} alt={alt} className="aspect-square w-full cursor-zoom-in object-cover transition group-hover:scale-105" />
          </button>
        ))}
      </div>

      {current !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={close} role="dialog" aria-modal="true">
          <button type="button" onClick={close} className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-1.5 text-xl leading-none text-white hover:bg-white/20" aria-label="Đóng">
            ✕
          </button>
          {count > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                step(-1);
              }}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-4 py-3 text-2xl leading-none text-white hover:bg-white/20"
              aria-label="Ảnh trước"
            >
              ‹
            </button>
          )}
          <img src={urls[current]} alt={alt} onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full rounded-lg object-contain" />
          {count > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                step(1);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-4 py-3 text-2xl leading-none text-white hover:bg-white/20"
              aria-label="Ảnh sau"
            >
              ›
            </button>
          )}
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-sm text-white">
            {current + 1} / {count}
          </p>
        </div>
      )}
    </>
  );
}
