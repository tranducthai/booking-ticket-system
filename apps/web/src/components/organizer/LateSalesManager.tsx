import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiErrorMessage } from "../../api/client";
import { resaleApi } from "../../api/resale";
import type { EventItem } from "../../api/types";
import { formatDateTime } from "../../lib/format";

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Organizer: after the sales deadline, reopen whatever is unsold (tiers and
 * seats) until a chosen time — at most the event start. Shown only once the
 * regular window has closed.
 */
export function LateSalesManager({ event }: { event: EventItem }) {
  const qc = useQueryClient();
  const [until, setUntil] = useState(toLocalInput(event.startTime));
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (value: string | null) => resaleApi.setLateSales(event.id, value ? new Date(value).toISOString() : null),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ["event", event.id] });
    },
    onError: (err) => setError(apiErrorMessage(err, "Không thể cập nhật.")),
  });

  const now = Date.now();
  const closed = !!event.salesEndTime && new Date(event.salesEndTime).getTime() <= now;
  const started = new Date(event.startTime).getTime() <= now;
  if (event.status !== "PUBLISHED" || event.ticketMode === "FREE_ENTRY" || !closed || started) return null;
  const open = !!event.lateSalesUntil && new Date(event.lateSalesUntil).getTime() > now;

  return (
    <div className="card p-6">
      <h3 className="text-base font-bold text-ink-800">Mở bán lại vé còn trống</h3>
      <p className="mt-1 text-sm text-ink-500">
        Đã hết hạn bán vé ({formatDateTime(event.salesEndTime!)}). Bạn có thể mở bán lại các vé, ghế còn trống tới trước giờ diễn — sự kiện sẽ xuất hiện ở mục
        "BTC mở bán lại" trên trang Bán lại vé.
      </p>
      {open ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">Đang mở bán lại đến {formatDateTime(event.lateSalesUntil!)}</span>
          <button onClick={() => save.mutate(null)} disabled={save.isPending} className="btn-ghost">
            Đóng mở bán lại
          </button>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Mở bán đến</label>
            <input type="datetime-local" value={until} max={toLocalInput(event.startTime)} onChange={(e) => setUntil(e.target.value)} className="input" />
          </div>
          <button onClick={() => save.mutate(until)} disabled={save.isPending || !until} className="btn-primary">
            Mở bán lại
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
