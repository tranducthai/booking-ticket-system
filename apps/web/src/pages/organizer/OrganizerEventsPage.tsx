import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { EVENT_STATUS_LABEL, EVENT_STATUS_TONE, eventsApi, type AdminEventRow } from "../../api/events";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageSpinner } from "../../components/ui/Spinner";

type Tab = "upcoming" | "past" | "pending" | "draft" | "closed";

const TABS: { value: Tab; label: string }[] = [
  { value: "upcoming", label: "Sắp tới" },
  { value: "past", label: "Đã qua" },
  { value: "pending", label: "Chờ duyệt" },
  { value: "draft", label: "Nháp" },
  { value: "closed", label: "Từ chối / Đã hủy" },
];

const PAGE_SIZE = 6;

/** Status decides the tab first; only a published event is split into upcoming/past by its end time. */
function tabOf(e: AdminEventRow, now: number): Tab {
  switch (e.status) {
    case "DRAFT":
      return "draft";
    case "PENDING_APPROVAL":
      return "pending";
    case "REJECTED":
    case "CANCELED":
      return "closed";
    default:
      return new Date(e.endTime).getTime() < now ? "past" : "upcoming";
  }
}

const WEEKDAY = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

/** "19:30, Thứ 6, 09 tháng 10 2026" */
function formatLongDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}, ${WEEKDAY[d.getDay()]}, ${pad(d.getDate())} tháng ${pad(d.getMonth() + 1)} ${d.getFullYear()}`;
}

/** Ticketbox Organizer Center-style list: search, time/status tabs, one banner card per event with its management shortcuts. */
export function OrganizerEventsPage() {
  const [tab, setTab] = useState<Tab>("upcoming");
  const [draft, setDraft] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);
  // An organizer runs tens of events, not thousands — fetch once, filter client-side.
  const { data, isLoading } = useQuery({ queryKey: ["events", "mine"], queryFn: () => eventsApi.myEvents({ limit: 100 }) });
  const all = data?.data ?? [];
  const now = Date.now();
  const needle = term.trim().toLowerCase();
  const matches = all.filter((e) => !needle || e.title.toLowerCase().includes(needle) || e.venueName.toLowerCase().includes(needle));
  const rows = matches.filter((e) => tabOf(e, now) === tab).sort((a, b) =>
    // Upcoming: soonest first. Everything else: most recent first.
    tab === "upcoming" ? a.startTime.localeCompare(b.startTime) : b.startTime.localeCompare(a.startTime),
  );
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const count = (t: Tab) => matches.filter((e) => tabOf(e, now) === t).length;

  const switchTab = (t: Tab) => {
    setTab(t);
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl">Sự kiện của tôi</h1>
        <Link to="/kenh-to-chuc/su-kien/moi" className="btn-primary">
          + Tạo sự kiện
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <form
          onSubmit={(ev) => {
            ev.preventDefault();
            setTerm(draft);
            setPage(1);
          }}
          className="flex w-full max-w-md overflow-hidden rounded-xl border border-ink-200 bg-white focus-within:border-brand-400"
        >
          <input
            value={draft}
            onChange={(ev) => setDraft(ev.target.value)}
            placeholder="Tìm kiếm sự kiện"
            className="min-w-0 flex-1 px-4 py-2.5 text-sm outline-none"
          />
          <button type="submit" className="bg-brand-500 px-5 text-sm font-semibold text-white hover:bg-brand-600">
            Tìm kiếm
          </button>
        </form>

        <div className="flex flex-wrap gap-1 rounded-full bg-ink-100 p-1">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => switchTab(t.value)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                tab === t.value ? "bg-brand-500 text-white shadow" : "text-ink-600 hover:text-ink-900"
              }`}
            >
              {t.label}
              <span className={`ml-1.5 text-xs ${tab === t.value ? "text-white/80" : "text-ink-400"}`}>{count(t.value)}</span>
            </button>
          ))}
        </div>
      </div>

      {tab === "pending" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Lưu ý:</strong> Sự kiện đang chờ duyệt. Để đảm bảo tính bảo mật cho sự kiện của bạn, quyền truy cập vào trang chỉ dành cho chủ sở hữu và
          quản trị viên được ủy quyền.
        </div>
      )}

      {isLoading ? (
        <PageSpinner />
      ) : all.length === 0 ? (
        <EmptyState title="Chưa có sự kiện nào" description="Tạo sự kiện đầu tiên để bắt đầu bán vé." />
      ) : visible.length === 0 ? (
        <EmptyState title={needle ? "Không có sự kiện nào phù hợp" : "Không có sự kiện nào trong mục này"} />
      ) : (
        <div className="space-y-4">
          {visible.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-1">
          <PageButton disabled={current === 1} onClick={() => setPage(current - 1)}>
            ‹
          </PageButton>
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <PageButton key={p} active={p === current} onClick={() => setPage(p)}>
              {p}
            </PageButton>
          ))}
          <PageButton disabled={current === pages} onClick={() => setPage(current + 1)}>
            ›
          </PageButton>
        </div>
      )}
    </div>
  );
}

function EventCard({ event: e }: { event: AdminEventRow }) {
  const base = `/kenh-to-chuc/su-kien/${e.id}`;
  const location = e.isOnline ? "Online Event" : [e.venueName, e.province].filter(Boolean).join(" · ");
  const pct = e.ticketsTotal > 0 ? Math.round((e.ticketsSold / e.ticketsTotal) * 100) : 0;
  const actions = [
    { to: base, label: "Tổng quan" },
    { to: `${base}/khach-tham-du`, label: "Khách tham dự" },
    { to: `${base}/check-in`, label: "Check-in" },
    { to: `${base}/hoan-tien`, label: "Hoàn vé" },
    ...(e.ticketMode === "FREE_ENTRY" ? [] : [{ to: `${base}/thiet-lap?buoc=2`, label: e.ticketMode === "SEATMAP" ? "Sơ đồ ghế" : "Loại vé" }]),
    { to: `${base}/thiet-lap`, label: "Chỉnh sửa" },
  ];

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-4 p-4 sm:flex-row">
        <Link to={base} className="block shrink-0 overflow-hidden rounded-xl bg-ink-100 sm:w-64">
          {e.bannerUrl ? (
            <img src={e.bannerUrl} alt="" className="aspect-[16/9] h-full w-full object-cover" />
          ) : (
            <div className="flex aspect-[16/9] items-center justify-center text-xs text-ink-400">Chưa có ảnh bìa</div>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <Link to={base} className="text-lg font-bold text-ink-900 hover:text-brand-600">
              {e.title}
            </Link>
            <Badge tone={EVENT_STATUS_TONE[e.status]}>{EVENT_STATUS_LABEL[e.status]}</Badge>
          </div>
          <p className="mt-2 flex items-center gap-2 text-sm font-medium text-brand-600">
            <span aria-hidden>🗓</span>
            {formatLongDate(e.startTime)}
          </p>
          <p className="mt-1 flex items-center gap-2 text-sm text-ink-600">
            <span aria-hidden>📍</span>
            {location}
          </p>
          {e.status === "REJECTED" && e.rejectedReason && <p className="mt-2 text-sm text-red-600">Lý do từ chối: {e.rejectedReason}</p>}
          {e.ticketMode !== "FREE_ENTRY" && e.ticketsTotal > 0 && (
            <div className="mt-3 max-w-xs">
              <p className="text-xs text-ink-500">
                Đã bán <strong className="text-ink-800">{e.ticketsSold}</strong>/{e.ticketsTotal} vé
              </p>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap border-t border-ink-100 bg-ink-50/60">
        {actions.map((a) => (
          <Link
            key={a.label}
            to={a.to}
            className="flex-1 whitespace-nowrap px-3 py-2.5 text-center text-sm font-semibold text-ink-600 hover:bg-white hover:text-brand-600"
          >
            {a.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function PageButton({ children, active, disabled, onClick }: { children: React.ReactNode; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`h-9 min-w-9 rounded-lg px-3 text-sm font-semibold disabled:opacity-40 ${
        active ? "bg-brand-500 text-white" : "bg-white text-ink-600 hover:bg-ink-100"
      }`}
    >
      {children}
    </button>
  );
}
