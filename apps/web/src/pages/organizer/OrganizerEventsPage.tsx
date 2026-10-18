import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { EVENT_STATUS_LABEL, EVENT_STATUS_TONE, eventsApi } from "../../api/events";
import type { EventStatus } from "../../api/types";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageSpinner } from "../../components/ui/Spinner";
import { formatDateTime } from "../../lib/format";

const TABS: { value: EventStatus | ""; label: string }[] = [
  { value: "", label: "Tất cả" },
  { value: "PUBLISHED", label: "Đang bán" },
  { value: "PENDING_APPROVAL", label: "Chờ duyệt" },
  { value: "DRAFT", label: "Nháp" },
  { value: "REJECTED", label: "Bị từ chối" },
  { value: "CANCELED", label: "Đã hủy" },
];

/** Every event the organizer runs, each with its sales progress and shortcuts into its management pages. */
export function OrganizerEventsPage() {
  const [status, setStatus] = useState<EventStatus | "">("");
  const [q, setQ] = useState("");
  // An organizer runs tens of events, not thousands — fetch once, filter client-side.
  const { data, isLoading } = useQuery({ queryKey: ["events", "mine"], queryFn: () => eventsApi.myEvents({ limit: 100 }) });
  const all = data?.data ?? [];
  const term = q.trim().toLowerCase();
  const rows = all.filter(
    (e) => (!status || e.status === status) && (!term || e.title.toLowerCase().includes(term) || e.venueName.toLowerCase().includes(term)),
  );
  const count = (s: EventStatus | "") => all.filter((e) => !s || e.status === s).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl">Sự kiện của tôi</h1>
          <p className="mt-1 text-sm text-ink-500">Chọn một sự kiện để chỉnh sửa, xem khách tham dự, check-in và xử lý hoàn vé.</p>
        </div>
        <Link to="/kenh-to-chuc/su-kien/moi" className="btn-primary">
          + Tạo sự kiện mới
        </Link>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-ink-100">
        {TABS.map((t) => (
          <button
            key={t.label}
            onClick={() => setStatus(t.value)}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-semibold ${
              status === t.value ? "border-brand-500 text-brand-600" : "border-transparent text-ink-500 hover:text-ink-800"
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-xs text-ink-400">{count(t.value)}</span>
          </button>
        ))}
      </div>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên sự kiện, địa điểm..." className="input max-w-md" />

      {isLoading ? (
        <PageSpinner />
      ) : all.length === 0 ? (
        <EmptyState title="Chưa có sự kiện nào" description="Tạo sự kiện đầu tiên để bắt đầu bán vé." />
      ) : rows.length === 0 ? (
        <EmptyState title="Không có sự kiện nào phù hợp" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-left text-xs uppercase text-ink-400">
              <tr>
                <th className="px-4 py-3">Sự kiện</th>
                <th className="px-4 py-3">Thời gian</th>
                <th className="px-4 py-3">Đã bán</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3 text-right">Quản lý</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const pct = e.ticketsTotal > 0 ? Math.round((e.ticketsSold / e.ticketsTotal) * 100) : 0;
                const base = `/kenh-to-chuc/su-kien/${e.id}`;
                return (
                  <tr key={e.id} className="border-t border-ink-100 align-top">
                    <td className="px-4 py-3">
                      <Link to={base} className="font-semibold text-ink-900 hover:text-brand-600">
                        {e.title}
                      </Link>
                      <p className="text-xs text-ink-400">
                        {e.category?.name} · {e.venueName}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-600">{formatDateTime(e.startTime)}</td>
                    <td className="px-4 py-3">
                      <p className="whitespace-nowrap font-semibold text-ink-800">
                        {e.ticketsSold}/{e.ticketsTotal}
                      </p>
                      <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-ink-100">
                        <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={EVENT_STATUS_TONE[e.status]}>{EVENT_STATUS_LABEL[e.status]}</Badge>
                      {e.status === "REJECTED" && e.rejectedReason && <p className="mt-1 max-w-[14rem] text-xs text-red-600">{e.rejectedReason}</p>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <Link to={base} className="font-semibold text-brand-600 hover:underline">
                        Mở
                      </Link>
                      {e.status === "PUBLISHED" && (
                        <>
                          <Link to={`${base}/khach-tham-du`} className="ml-3 text-ink-500 hover:underline">
                            Khách
                          </Link>
                          <Link to={`${base}/check-in`} className="ml-3 text-ink-500 hover:underline">
                            Check-in
                          </Link>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
