import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { bookingApi, ORDER_STATUS_LABEL } from "../../api/booking";
import { eventsApi } from "../../api/events";
import type { EventItem, OrderStatus, OrganizerStats, StatsBucket } from "../../api/types";
import { formatVnd } from "../../lib/format";
import { StatCard } from "./StatCard";

type Mode = "all" | "year" | "month" | "day";
const MODES: Array<{ value: Mode; label: string }> = [
  { value: "all", label: "Toàn bộ" },
  { value: "year", label: "Theo năm" },
  { value: "month", label: "Theo tháng" },
  { value: "day", label: "Theo ngày" },
];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

interface Period {
  from?: Date;
  to?: Date;
  bucket: StatsBucket;
  /** Every bucket key of the period, so empty days/months show as zero bars. Undefined for "all" (derived from the data). */
  keys?: string[];
}

function periodOf(mode: Mode, year: number, month: string, dayFrom: string, dayTo: string): Period {
  if (mode === "all") return { bucket: "month" };
  if (mode === "year") {
    return { from: new Date(year, 0, 1), to: new Date(year + 1, 0, 1), bucket: "month", keys: Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1)}`) };
  }
  if (mode === "month") {
    const [y, m] = month.split("-").map(Number);
    const days = new Date(y, m, 0).getDate();
    return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1), bucket: "day", keys: Array.from({ length: days }, (_, i) => `${month}-${pad(i + 1)}`) };
  }
  // A custom range, both ends inclusive. One day -> by hour; up to ~2 months -> by day; longer -> by month.
  const [fy, fm, fd] = dayFrom.split("-").map(Number);
  const [ty, tm, td] = dayTo.split("-").map(Number);
  const from = new Date(fy, fm - 1, fd);
  const to = new Date(ty, tm - 1, td + 1);
  const dayCount = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  if (dayCount <= 1) return { from, to, bucket: "hour", keys: Array.from({ length: 24 }, (_, i) => `${dayFrom}T${pad(i)}`) };
  if (dayCount <= 62) return { from, to, bucket: "day", keys: Array.from({ length: dayCount }, (_, i) => ymd(new Date(fy, fm - 1, fd + i))) };
  return { from, to, bucket: "month", keys: monthsBetween(`${fy}-${pad(fm)}`, `${ty}-${pad(tm)}`) };
}

/** Server bucket "YYYY-MM-DDTHH:MM" -> the key at this granularity. */
const keyOf = (bucket: StatsBucket, raw: string) => (bucket === "month" ? raw.slice(0, 7) : bucket === "day" ? raw.slice(0, 10) : raw.slice(0, 13));

/** "all": every month from the first to the last bucket that has data. */
function monthsBetween(first: string, last: string): string[] {
  const out: string[] = [];
  let [y, m] = first.split("-").map(Number);
  const [ly, lm] = last.split("-").map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${pad(m)}`);
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

function labelOf(bucket: StatsBucket, key: string, short: boolean) {
  if (bucket === "month") return short ? `T${Number(key.slice(5, 7))}` : `Tháng ${Number(key.slice(5, 7))}/${key.slice(0, 4)}`;
  if (bucket === "day") return short ? String(Number(key.slice(8, 10))) : `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;
  return short ? `${key.slice(11, 13)}h` : `${key.slice(11, 13)}:00 ${key.slice(8, 10)}/${key.slice(5, 7)}`;
}

const NUM = new Intl.NumberFormat("vi-VN");

/**
 * Organizer statistics: scope (all events / one event) × period (all time /
 * a year / a month / a day) → summary cards, a trend chart, a per-event table
 * or the ticket-type split, and the order funnel.
 */
export function OrganizerStatsPanel({ events }: { events: EventItem[] }) {
  const now = new Date();
  const [eventId, setEventId] = useState("");
  const [mode, setMode] = useState<Mode>("month");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}`);
  const [dayFrom, setDayFrom] = useState(ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)));
  const [dayTo, setDayTo] = useState(ymd(now));
  const [metric, setMetric] = useState<"revenue" | "orders" | "tickets">("revenue");

  const period = useMemo(() => periodOf(mode, year, month, dayFrom, dayTo), [mode, year, month, dayFrom, dayTo]);
  const { data } = useQuery({
    queryKey: ["orders", "organizer-stats", eventId, mode, year, month, dayFrom, dayTo],
    queryFn: () => bookingApi.organizerStats({ eventId: eventId || undefined, from: period.from?.toISOString(), to: period.to?.toISOString(), bucket: period.bucket }),
    placeholderData: (prev) => prev,
  });
  const { data: selectedEvent } = useQuery({ queryKey: ["event", eventId], queryFn: () => eventsApi.getById(eventId), enabled: !!eventId });

  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);
  const titleOf = (id: string) => events.find((e) => e.id === id)?.title ?? "Sự kiện đã xoá";

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-end gap-4 p-4">
        <div className="min-w-[220px] flex-1">
          <label className="label">Sự kiện</label>
          <select value={eventId} onChange={(e) => setEventId(e.target.value)} className="input">
            <option value="">Tất cả sự kiện</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Thời gian</label>
          <div className="flex gap-1 rounded-xl bg-ink-100 p-1">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${mode === m.value ? "bg-white text-brand-600 shadow-sm" : "text-ink-500 hover:text-ink-800"}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        {mode === "year" && (
          <div>
            <label className="label">Năm</label>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="input">
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        )}
        {mode === "month" && (
          <div>
            <label className="label">Tháng</label>
            <input type="month" value={month} max={`${now.getFullYear()}-${pad(now.getMonth() + 1)}`} onChange={(e) => e.target.value && setMonth(e.target.value)} className="input" />
          </div>
        )}
        {mode === "day" && (
          <>
            <div>
              <label className="label">Từ ngày</label>
              <input
                type="date"
                value={dayFrom}
                max={dayTo}
                onChange={(e) => e.target.value && setDayFrom(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">Đến ngày</label>
              <input
                type="date"
                value={dayTo}
                min={dayFrom}
                max={ymd(now)}
                onChange={(e) => e.target.value && setDayTo(e.target.value)}
                className="input"
              />
            </div>
          </>
        )}
      </div>

      {data && (
        <>
          <Cards data={data} />

          <div className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-bold text-ink-700">Xu hướng theo {period.bucket === "month" ? "tháng" : period.bucket === "day" ? "ngày" : "giờ"}</p>
              <div className="flex gap-1 rounded-lg bg-ink-100 p-1 text-xs font-semibold">
                {(
                  [
                    ["revenue", "Doanh thu"],
                    ["orders", "Đơn hàng"],
                    ["tickets", "Vé bán"],
                  ] as const
                ).map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setMetric(v)} className={`rounded-md px-3 py-1 ${metric === v ? "bg-white text-brand-600 shadow-sm" : "text-ink-500"}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <TrendChart data={data} period={period} metric={metric} />
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
            {eventId ? (
              <TicketTypeTable data={data} event={selectedEvent} />
            ) : (
              <EventTable data={data} titleOf={titleOf} onPick={setEventId} />
            )}
            <Funnel byStatus={data.byStatus} />
          </div>
        </>
      )}
    </div>
  );
}

function Cards({ data }: { data: OrganizerStats }) {
  const t = data.totals;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Doanh thu" value={formatVnd(t.revenue)} />
      <StatCard label="Đơn đã thanh toán" value={NUM.format(t.orders)} />
      <StatCard label="Vé đã bán" value={NUM.format(t.ticketsSold)} />
      <StatCard label="Số người mua" value={NUM.format(t.buyers)} />
    </div>
  );
}

function TrendChart({ data, period, metric }: { data: OrganizerStats; period: Period; metric: "revenue" | "orders" | "tickets" }) {
  const bucket = period.bucket;
  const byKey = new Map(data.series.map((r) => [keyOf(bucket, r.bucket), r]));
  let keys = period.keys;
  if (!keys) {
    const ks = [...byKey.keys()].sort();
    keys = ks.length > 0 ? monthsBetween(ks[0], ks[ks.length - 1]) : [];
  }
  if (keys.length === 0 || data.series.length === 0) {
    return <div className="flex h-56 items-center justify-center text-sm text-ink-400">Chưa có dữ liệu trong khoảng thời gian này.</div>;
  }

  const rows = keys.map((k) => ({ key: k, value: byKey.get(k)?.[metric] ?? 0 }));
  const max = Math.max(...rows.map((r) => r.value), 1);
  const fmt = (v: number) => (metric === "revenue" ? formatVnd(v) : NUM.format(v));
  const width = 760;
  const height = 240;
  const pad4 = { top: 12, right: 8, bottom: 28, left: 8 };
  const chartW = width - pad4.left - pad4.right;
  const chartH = height - pad4.top - pad4.bottom;
  const gap = rows.length > 40 ? 2 : 4;
  const barW = Math.max((chartW - gap * (rows.length - 1)) / rows.length, 2);
  const every = Math.max(Math.ceil(rows.length / 12), 1);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 w-full" role="img" aria-label="Biểu đồ thống kê theo thời gian">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={pad4.left} x2={width - pad4.right} y1={pad4.top + chartH * (1 - f)} y2={pad4.top + chartH * (1 - f)} className="stroke-ink-100" strokeWidth="1" />
      ))}
      {rows.map((r, i) => {
        const h = (r.value / max) * chartH;
        const x = pad4.left + i * (barW + gap);
        return (
          <g key={r.key}>
            <rect x={x} y={pad4.top + chartH - h} width={barW} height={Math.max(h, r.value > 0 ? 2 : 0)} rx={2} className="fill-brand-400 hover:fill-brand-600">
              <title>
                {labelOf(bucket, r.key, false)}: {fmt(r.value)}
              </title>
            </rect>
            {i % every === 0 && (
              <text x={x + barW / 2} y={height - 8} textAnchor="middle" className="fill-ink-400 text-[10px]">
                {labelOf(bucket, r.key, true)}
              </text>
            )}
          </g>
        );
      })}
      <text x={pad4.left} y={pad4.top - 2} className="fill-ink-400 text-[10px]">
        Cao nhất: {fmt(max)}
      </text>
    </svg>
  );
}

function EventTable({ data, titleOf, onPick }: { data: OrganizerStats; titleOf: (id: string) => string; onPick: (id: string) => void }) {
  const total = data.totals.revenue || 1;
  return (
    <div className="card overflow-hidden">
      <p className="px-5 pb-2 pt-5 text-sm font-bold text-ink-700">Theo sự kiện</p>
      {data.byEvent.length === 0 ? (
        <p className="px-5 pb-6 text-sm text-ink-400">Chưa có đơn hàng nào trong khoảng thời gian này.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-left text-xs uppercase text-ink-400">
              <tr>
                <th className="px-5 py-2.5">Sự kiện</th>
                <th className="px-3 py-2.5 text-right">Doanh thu</th>
                <th className="px-3 py-2.5 text-right">Đơn</th>
                <th className="px-3 py-2.5 text-right">Vé</th>
                <th className="px-5 py-2.5 text-right">Người mua</th>
              </tr>
            </thead>
            <tbody>
              {data.byEvent.map((r) => (
                <tr key={r.eventId} className="border-t border-ink-100">
                  <td className="max-w-[260px] px-5 py-3">
                    <button onClick={() => onPick(r.eventId)} className="block truncate text-left font-semibold text-ink-900 hover:text-brand-600" title="Chỉ xem sự kiện này">
                      {titleOf(r.eventId)}
                    </button>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
                      <div className="h-full rounded-full bg-brand-400" style={{ width: `${Math.max((r.revenue / total) * 100, 1)}%` }} />
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-semibold">{formatVnd(r.revenue)}</td>
                  <td className="px-3 py-3 text-right">{NUM.format(r.orders)}</td>
                  <td className="px-3 py-3 text-right">{NUM.format(r.tickets)}</td>
                  <td className="px-5 py-3 text-right">{NUM.format(r.buyers)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TicketTypeTable({ data, event }: { data: OrganizerStats; event?: EventItem }) {
  const total = data.byTicketType.reduce((a, r) => a + r.revenue, 0) || 1;
  const nameOf = (r: OrganizerStats["byTicketType"][number]) =>
    r.ticketTypeId ? (event?.ticketTypes?.find((t) => t.id === r.ticketTypeId)?.name ?? "Hạng vé đã xoá") : r.seat ? "Ghế chọn trên sơ đồ" : "Vé";
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 pb-2 pt-5">
        <p className="text-sm font-bold text-ink-700">Theo hạng vé</p>
        {event && (
          <Link to={`/kenh-to-chuc/su-kien/${event.id}`} className="text-sm font-semibold text-brand-600 hover:underline">
            Quản lý sự kiện →
          </Link>
        )}
      </div>
      {data.byTicketType.length === 0 ? (
        <p className="px-5 pb-6 text-sm text-ink-400">Chưa bán được vé nào trong khoảng thời gian này.</p>
      ) : (
        <div className="space-y-4 px-5 pb-5 pt-2">
          {data.byTicketType.map((r, i) => (
            <div key={`${r.ticketTypeId}-${r.seat}-${i}`}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold text-ink-900">{nameOf(r)}</span>
                <span className="shrink-0 text-ink-500">
                  {NUM.format(r.quantity)} vé · <strong className="text-ink-800">{formatVnd(r.revenue)}</strong>
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-100">
                <div className="h-full rounded-full bg-brand-400" style={{ width: `${Math.max((r.revenue / total) * 100, 2)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const FUNNEL_COLOR: Partial<Record<OrderStatus, string>> = {
  TICKET_ISSUED: "bg-emerald-500",
  PAID: "bg-emerald-400",
  PENDING_PAYMENT: "bg-amber-400",
  EXPIRED: "bg-ink-300",
  CANCELED: "bg-red-400",
};

/** What happened to the orders placed in the period: paid, still pending, expired, canceled. */
function Funnel({ byStatus }: { byStatus: Record<string, number> }) {
  const rows = (Object.keys(FUNNEL_COLOR) as OrderStatus[]).map((s) => ({ status: s, n: byStatus[s] ?? 0 })).filter((r) => r.n > 0);
  const total = rows.reduce((a, r) => a + r.n, 0);
  return (
    <div className="card p-5">
      <p className="text-sm font-bold text-ink-700">Tình trạng đơn hàng</p>
      {total === 0 ? (
        <p className="mt-3 text-sm text-ink-400">Chưa có đơn hàng nào.</p>
      ) : (
        <>
          <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-ink-100">
            {rows.map((r) => (
              <div key={r.status} className={FUNNEL_COLOR[r.status]} style={{ width: `${(r.n / total) * 100}%` }} title={`${ORDER_STATUS_LABEL[r.status]}: ${r.n}`} />
            ))}
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            {rows.map((r) => (
              <li key={r.status} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-ink-600">
                  <span className={`h-2.5 w-2.5 rounded-full ${FUNNEL_COLOR[r.status]}`} />
                  {ORDER_STATUS_LABEL[r.status]}
                </span>
                <span className="font-semibold text-ink-900">
                  {NUM.format(r.n)} <span className="font-normal text-ink-400">({Math.round((r.n / total) * 100)}%)</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
