import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { apiErrorMessage } from "../../api/client";
import { eventsApi } from "../../api/events";
import type { EventItem } from "../../api/types";
import { formatDateTime } from "../../lib/format";

const WEEKDAYS = [
  { d: 1, label: "T2" },
  { d: 2, label: "T3" },
  { d: 3, label: "T4" },
  { d: 4, label: "T5" },
  { d: 5, label: "T6" },
  { d: 6, label: "T7" },
  { d: 0, label: "CN" },
];

/** "2026-10-14" + "19:30" -> ISO, in the organizer's local timezone. */
const at = (date: string, time: string) => new Date(`${date}T${time}:00`).toISOString();

/**
 * Lịch diễn of a multi-date event (event-service showtimes): list, add one
 * or a whole series (date range + weekdays, same hours), optionally copying
 * the ticket tiers of an existing showtime onto every new one, and delete
 * unsold ones. The first showtime added to an event that already sells
 * tiers keeps those tiers on an "original date" showtime (backend).
 */
export function ShowtimeManager({ event }: { event: EventItem }) {
  const qc = useQueryClient();
  const showtimes = event.showtimes ?? [];
  const tiers = event.ticketTypes ?? [];
  const [mode, setMode] = useState<"single" | "series">("single");
  const [form, setForm] = useState({ date: "", from: "", to: "", start: "19:00", end: "21:00", copyFrom: "" });
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["event", event.id] });

  const slots = (): { startTime: string; endTime: string }[] => {
    const dates: string[] = [];
    if (mode === "single") {
      if (form.date) dates.push(form.date);
    } else if (form.from && form.to) {
      for (let d = new Date(`${form.from}T00:00:00`); d <= new Date(`${form.to}T00:00:00`); d.setDate(d.getDate() + 1)) {
        if (days.includes(d.getDay())) {
          dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
        }
      }
    }
    // An end time earlier than the start means the show runs past midnight.
    return dates.map((date) => {
      const startTime = at(date, form.start);
      let endTime = at(date, form.end);
      if (endTime <= startTime) endTime = new Date(new Date(endTime).getTime() + 86_400_000).toISOString();
      return { startTime, endTime };
    });
  };

  const create = useMutation({
    mutationFn: () => eventsApi.showtimes.create(event.id, { items: slots(), copyTicketTypesFrom: form.copyFrom || undefined }),
    onSuccess: (created) => {
      setNotice(`Đã thêm ${created.length} suất diễn.`);
      setError(null);
      void refresh();
    },
    onError: (err) => setError(apiErrorMessage(err, "Không thể thêm suất diễn.")),
  });
  const remove = useMutation({
    mutationFn: (id: string) => eventsApi.showtimes.remove(id),
    onSuccess: () => void refresh(),
    onError: (err) => setError(apiErrorMessage(err, "Không thể xóa suất diễn.")),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setNotice(null);
    const n = slots().length;
    if (n === 0) return setError("Không có ngày nào phù hợp — kiểm tra lại khoảng ngày / thứ trong tuần.");
    if (n > 120) return setError("Tối đa 120 suất mỗi lần thêm.");
    create.mutate();
  }

  const preview = slots().length;

  return (
    <div className="card p-6">
      <h3 className="text-base font-bold text-ink-800">Lịch diễn</h3>
      <p className="mt-1 text-sm text-ink-500">
        {showtimes.length === 0
          ? "Sự kiện đang diễn một suất. Thêm suất diễn nếu sự kiện diễn ra nhiều ngày / nhiều khung giờ — mỗi suất có hạng vé và số lượng riêng."
          : `${showtimes.length} suất diễn — thời gian sự kiện được tính tự động từ suất sớm nhất đến suất muộn nhất.`}
      </p>

      {showtimes.length > 0 && (
        <div className="mt-4 max-h-80 space-y-1.5 overflow-y-auto">
          {showtimes.map((s) => {
            const own = tiers.filter((t) => t.showtimeId === s.id);
            const sold = own.reduce((n, t) => n + t.quantitySold, 0);
            const total = own.reduce((n, t) => n + t.quantityTotal, 0);
            return (
              <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-ink-100 px-3 py-2 text-sm">
                <span className="font-semibold text-ink-800">
                  {formatDateTime(s.startTime)} → {new Date(s.endTime).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="flex items-center gap-3 text-ink-500">
                  {own.length} hạng vé · {sold}/{total} vé
                  <button
                    type="button"
                    onClick={() => confirm("Xóa suất diễn này cùng các hạng vé của nó?") && remove.mutate(s.id)}
                    disabled={sold > 0 || remove.isPending}
                    title={sold > 0 ? "Đã bán vé — không thể xóa" : "Xóa suất"}
                    className="text-xs font-semibold text-red-600 hover:underline disabled:cursor-not-allowed disabled:text-ink-300 disabled:no-underline"
                  >
                    Xóa
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-5 space-y-3 border-t border-ink-100 pt-5">
        <div className="flex gap-2">
          {(["single", "series"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${mode === m ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-600"}`}
            >
              {m === "single" ? "Thêm 1 suất" : "Thêm nhiều suất"}
            </button>
          ))}
        </div>

        {mode === "single" ? (
          <div className="sm:w-1/2">
            <label className="label">Ngày diễn</label>
            <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" />
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Từ ngày</label>
                <input type="date" required value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} className="input" />
              </div>
              <div>
                <label className="label">Đến ngày</label>
                <input type="date" required value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} className="input" />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((w) => (
                <button
                  key={w.d}
                  type="button"
                  onClick={() => setDays((cur) => (cur.includes(w.d) ? cur.filter((x) => x !== w.d) : [...cur, w.d]))}
                  className={`h-9 w-11 rounded-lg text-sm font-semibold ${days.includes(w.d) ? "bg-emerald-500 text-white" : "bg-ink-100 text-ink-500"}`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">Giờ bắt đầu</label>
            <input type="time" required value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Giờ kết thúc</label>
            <input type="time" required value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Sao chép hạng vé từ</label>
            <select value={form.copyFrom} onChange={(e) => setForm({ ...form, copyFrom: e.target.value })} className="input" disabled={showtimes.length === 0}>
              <option value="">— Không sao chép —</option>
              {showtimes.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatDateTime(s.startTime)} ({tiers.filter((t) => t.showtimeId === s.id).length} hạng vé)
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {notice && <p className="text-sm text-emerald-600">{notice}</p>}
        <button type="submit" disabled={create.isPending || preview === 0} className="btn-primary">
          {create.isPending ? "Đang thêm..." : preview > 1 ? `Thêm ${preview} suất diễn` : "Thêm suất diễn"}
        </button>
      </form>
    </div>
  );
}
