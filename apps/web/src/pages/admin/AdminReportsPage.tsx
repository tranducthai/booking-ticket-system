import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { artistsApi } from "../../api/artists";
import { EVENT_STATUS_LABEL, EVENT_STATUS_TONE, eventsApi } from "../../api/events";
import { OrganizerStatsPanel } from "../../components/stats/OrganizerStatsPanel";
import { Badge } from "../../components/ui/Badge";
import { PageSpinner } from "../../components/ui/Spinner";
import { formatDateTime } from "../../lib/format";

/** Admin "Thống kê": the organizer dashboard's layout, system-wide — stats panel, upcoming events, things waiting on an admin. */
export function AdminReportsPage() {
  const { data, isLoading } = useQuery({ queryKey: ["admin", "events", "all"], queryFn: () => eventsApi.adminList({ limit: 100 }) });
  const { data: pending } = useQuery({ queryKey: ["admin", "pending-events", "list"], queryFn: () => eventsApi.pendingApproval({ limit: 5 }) });
  const { data: cancels } = useQuery({ queryKey: ["admin", "cancel-requests", "list"], queryFn: () => eventsApi.cancelRequests({ limit: 5 }) });

  const { data: pendingArtists } = useQuery({ queryKey: ["artists", "pending", "list"], queryFn: () => artistsApi.pending() });

  const events = data?.data ?? [];
  const now = Date.now();
  const upcoming = events
    .filter((e) => e.status === "PUBLISHED" && new Date(e.endTime).getTime() > now)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .slice(0, 5);
  const attention = [
    ...(pending?.data ?? []).map((e) => ({ key: `event-${e.id}`, to: "/admin/approvals", title: e.title, note: "Sự kiện đang chờ duyệt", badge: <Badge tone={EVENT_STATUS_TONE[e.status]}>{EVENT_STATUS_LABEL[e.status]}</Badge> })),
    ...(cancels?.data ?? []).map((e) => ({ key: `cancel-${e.id}`, to: "/admin/approvals", title: e.title, note: "Ban tổ chức yêu cầu hủy sự kiện", badge: <Badge tone={EVENT_STATUS_TONE[e.status]}>{EVENT_STATUS_LABEL[e.status]}</Badge> })),
    ...(pendingArtists?.data ?? []).slice(0, 5).map((a) => ({ key: `artist-${a.id}`, to: "/admin/artists", title: a.name, note: "Nghệ sĩ đang chờ duyệt", badge: <Badge tone="warning">Chờ duyệt</Badge> })),
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl">Thống kê</h1>

      <OrganizerStatsPanel events={events} basePath="/admin" />

      {isLoading ? (
        <PageSpinner />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-ink-700">Sắp diễn ra</p>
              <Link to="/admin/events" className="text-sm font-semibold text-brand-600 hover:underline">
                Tất cả sự kiện →
              </Link>
            </div>
            {upcoming.length === 0 ? (
              <p className="mt-3 text-sm text-ink-400">Không có sự kiện đang bán nào sắp diễn ra.</p>
            ) : (
              <div className="mt-3 divide-y divide-ink-100">
                {upcoming.map((e) => (
                  <Link key={e.id} to={`/admin/events/${e.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-brand-600">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink-900">{e.title}</p>
                      <p className="text-xs text-ink-500">{formatDateTime(e.startTime)}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-ink-700">
                      {e.ticketsSold}/{e.ticketsTotal} vé
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-ink-700">Cần chú ý</p>
              <Link to="/admin/approvals" className="text-sm font-semibold text-brand-600 hover:underline">
                Xem tất cả →
              </Link>
            </div>
            {attention.length === 0 ? (
              <p className="mt-3 text-sm text-ink-400">Không có gì đang chờ xử lý.</p>
            ) : (
              <div className="mt-3 divide-y divide-ink-100">
                {attention.map((a) => (
                  <Link key={a.key} to={a.to} className="flex items-center justify-between gap-3 py-3 hover:text-brand-600">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink-900">{a.title}</p>
                      <p className="text-xs text-ink-500">{a.note}</p>
                    </div>
                    {a.badge}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
