import clsx from "clsx";
import { useMemo, useState } from "react";
import type { Showtime, TicketType } from "../../api/types";
import { formatVnd } from "../../lib/format";
import { TicketTierList } from "./TicketTierList";

const WEEKDAYS = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];
const pad = (n: number) => String(n).padStart(2, "0");
/** Local-date keys — the schedule is read in the buyer's own timezone. */
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const longDate = (d: Date) => d.toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

type ShowStatus = "ended" | "soldout" | "open";

/**
 * "Lịch diễn" for a multi-date event, Ticketbox-style: a month calendar
 * marking the days with performances (click a day -> side panel with its
 * showtimes and their ticket tiers) or a plain list. One order covers one
 * showtime: picking tickets of another showtime clears the previous picks.
 */
export function ShowtimeSchedule({
  showtimes,
  tiers,
  quantities,
  onQuantitiesChange,
  maxTicketsPerAccount,
  onBuy,
  buying,
  error,
}: {
  showtimes: Showtime[];
  tiers: TicketType[];
  quantities: Record<string, number>;
  onQuantitiesChange: (next: Record<string, number>) => void;
  maxTicketsPerAccount: number | null;
  onBuy: () => void;
  buying: boolean;
  error: string | null;
}) {
  const now = Date.now();
  const tiersOf = (showtimeId: string) => tiers.filter((t) => t.showtimeId === showtimeId);
  const statusOf = (s: Showtime): ShowStatus => {
    if (new Date(s.endTime).getTime() <= now) return "ended";
    const own = tiersOf(s.id);
    return own.length === 0 || own.every((t) => t.quantitySold >= t.quantityTotal) ? "soldout" : "open";
  };

  const byDay = useMemo(() => {
    const map = new Map<string, Showtime[]>();
    for (const s of showtimes) {
      const key = dayKey(new Date(s.startTime));
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return map;
  }, [showtimes]);
  const months = useMemo(() => [...new Set(showtimes.map((s) => monthKey(new Date(s.startTime))))].sort(), [showtimes]);
  const firstUpcoming = showtimes.find((s) => new Date(s.endTime).getTime() > now) ?? showtimes[0];

  const [view, setView] = useState<"calendar" | "list">(showtimes.length > 6 ? "calendar" : "list");
  const [month, setMonth] = useState(firstUpcoming ? monthKey(new Date(firstUpcoming.startTime)) : months[0]);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(firstUpcoming && statusOf(firstUpcoming) === "open" ? firstUpcoming.id : null);

  const setQty = (tierId: string, v: number) => {
    const tier = tiers.find((t) => t.id === tierId);
    // Keep only picks from this tier's showtime — an order is for one performance.
    const next: Record<string, number> = {};
    for (const [id, q] of Object.entries(quantities)) {
      if (q > 0 && tiers.find((t) => t.id === id)?.showtimeId === tier?.showtimeId) next[id] = q;
    }
    next[tierId] = v;
    onQuantitiesChange(next);
  };
  const picked = Object.entries(quantities).filter(([, q]) => q > 0);
  const pickedCount = picked.reduce((n, [, q]) => n + q, 0);
  const pickedTotal = picked.reduce((sum, [id, q]) => sum + Number(tiers.find((t) => t.id === id)?.price ?? 0) * q, 0);

  const showtimeRow = (s: Showtime, showDate: boolean) => {
    const status = statusOf(s);
    const isOpen = expanded === s.id;
    return (
      <div key={s.id} className="rounded-xl border border-ink-100 bg-white">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => setExpanded(isOpen ? null : s.id)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            aria-expanded={isOpen}
          >
            <svg viewBox="0 0 24 24" className={clsx("h-4 w-4 shrink-0 text-ink-400 transition-transform", isOpen && "rotate-90")} fill="none">
              <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className={clsx("font-bold", status === "ended" ? "text-ink-400" : "text-ink-900")}>
              {hhmm(s.startTime)} - {hhmm(s.endTime)}
              {showDate && <span className="font-semibold">, {new Date(s.startTime).toLocaleDateString("vi-VN", { day: "numeric", month: "long", year: "numeric" })}</span>}
            </span>
          </button>
          {status === "open" ? (
            <button type="button" onClick={() => setExpanded(s.id)} className="btn-primary shrink-0 px-4 py-1.5 text-sm">
              Mua vé ngay
            </button>
          ) : (
            <span className="shrink-0 rounded-lg bg-ink-100 px-4 py-1.5 text-sm font-semibold text-ink-400">{status === "ended" ? "Đã kết thúc" : "Hết vé"}</span>
          )}
        </div>
        {isOpen && (
          <div className="border-t border-ink-100 px-4 py-4">
            <p className="mb-3 text-sm font-bold text-ink-700">Thông tin vé</p>
            {status === "ended" ? (
              <p className="text-sm text-ink-400">Suất diễn này đã kết thúc.</p>
            ) : (
              <TicketTierList tiers={tiersOf(s.id)} quantities={quantities} onChange={setQty} maxTicketsPerAccount={maxTicketsPerAccount} />
            )}
          </div>
        )}
      </div>
    );
  };

  // ---- calendar grid for `month` (Monday-first) ----
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7; // blanks before the 1st
  const daysInMonth = new Date(y, m, 0).getDate();
  const todayKey = dayKey(new Date());
  const monthIdx = months.indexOf(month);
  const shiftMonth = (delta: number) => {
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(monthKey(d));
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="label mb-0">Các hạng mục vé</p>
        <div className="flex overflow-hidden rounded-full border border-ink-200">
          {(["list", "calendar"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={clsx("px-3 py-1.5 text-xs font-semibold", view === v ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-50")}
            >
              {v === "list" ? "Danh sách" : "Lịch"}
            </button>
          ))}
        </div>
      </div>

      {view === "list" ? (
        <div className="mt-4 space-y-2.5">{showtimes.map((s) => showtimeRow(s, true))}</div>
      ) : (
        <div className="mt-4">
          {/* month tabs */}
          <div className="flex items-center gap-1 border-b border-ink-100">
            <button type="button" onClick={() => shiftMonth(-1)} className="px-2 py-2 text-ink-400 hover:text-ink-800" aria-label="Tháng trước">
              ‹
            </button>
            <div className="flex flex-1 gap-1 overflow-x-auto">
              {[-1, 0, 1, 2].map((offset) => {
                const d = new Date(y, m - 1 + offset, 1);
                const key = monthKey(d);
                const count = showtimes.filter((s) => monthKey(new Date(s.startTime)) === key).length;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setMonth(key)}
                    className={clsx(
                      "-mb-px min-w-[7rem] flex-1 border-b-2 px-2 py-2 text-center",
                      key === month ? "border-emerald-500 text-emerald-600" : "border-transparent text-ink-500 hover:text-ink-800",
                    )}
                  >
                    <span className="block text-sm font-bold">{offset === 0 ? `Tháng ${d.getMonth() + 1}, ${d.getFullYear()}` : `Th ${d.getMonth() + 1}`}</span>
                    <span className="block text-[11px]">{count} suất diễn</span>
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={() => shiftMonth(1)} className="px-2 py-2 text-ink-400 hover:text-ink-800" aria-label="Tháng sau">
              ›
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 text-center text-xs font-bold text-ink-500">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-2">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {Array.from({ length: lead }, (_, i) => (
              <div key={`b${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const key = `${month}-${pad(i + 1)}`;
              const shows = byDay.get(key) ?? [];
              const has = shows.length > 0;
              const live = shows.some((s) => statusOf(s) === "open");
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!has}
                  onClick={() => setOpenDay(key)}
                  className={clsx(
                    "flex h-14 flex-col items-center justify-center rounded-lg text-sm",
                    has ? "font-bold text-ink-900 hover:bg-emerald-50" : "text-ink-300",
                    key === todayKey && "ring-1 ring-emerald-400",
                    openDay === key && "bg-emerald-50",
                  )}
                >
                  {pad(i + 1)}
                  {has && <span className={clsx("mt-1 h-1 w-7 rounded-full", live ? "bg-emerald-500" : "bg-ink-300")} />}
                </button>
              );
            })}
          </div>
          {monthIdx === -1 && <p className="mt-3 text-center text-sm text-ink-400">Không có suất diễn nào trong tháng này.</p>}
        </div>
      )}

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {/* Day panel (calendar view): that day's showtimes, slide-in from the right. */}
      {openDay && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={() => setOpenDay(null)}>
          <div className="flex h-full w-full max-w-md flex-col bg-ink-50 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-ink-100 bg-white px-5 py-4">
              <p className="font-bold capitalize text-emerald-600">{longDate(new Date(`${openDay}T00:00:00`))}</p>
              <button type="button" onClick={() => setOpenDay(null)} className="text-xl text-ink-400 hover:text-ink-800" aria-label="Đóng">
                ×
              </button>
            </div>
            <div className="flex-1 space-y-2.5 overflow-y-auto p-4">{(byDay.get(openDay) ?? []).map((s) => showtimeRow(s, false))}</div>
            <div className="border-t border-ink-100 bg-white p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-500">Đã chọn {pickedCount} vé</span>
                <span className="text-base font-extrabold text-brand-600">{formatVnd(pickedTotal)}</span>
              </div>
              <button type="button" onClick={onBuy} disabled={buying || pickedCount === 0} className="btn-primary mt-3 w-full py-3">
                {buying ? "Đang xử lý..." : "Mua vé"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
