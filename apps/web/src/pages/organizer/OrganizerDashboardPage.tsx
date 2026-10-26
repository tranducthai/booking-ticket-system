import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { bookingApi } from "../../api/booking";
import { EVENT_STATUS_LABEL, EVENT_STATUS_TONE, eventsApi } from "../../api/events";
import type { OrderStatsDaily } from "../../api/types";
import { RevenueTrendChart } from "../../components/stats/RevenueTrendChart";
import { StatCard } from "../../components/stats/StatCard";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageSpinner } from "../../components/ui/Spinner";
import { formatDateTime, formatVnd } from "../../lib/format";

export function OrganizerDashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ["events", "mine"], queryFn: () => eventsApi.myEvents({ limit: 100 }) });
  const eventIds = useMemo(() => data?.data.map((e) => e.id) ?? [], [data]);

  const statsQueries = useQueries({
    queries: eventIds.map((eventId) => ({
      queryKey: ["orders", "stats", eventId],
      queryFn: () => bookingApi.stats({ eventId, days: 30 }),
    })),
  });
  const overview = useMemo(() => {
    if (eventIds.length === 0 || statsQueries.some((q) => !q.data)) return null;
    const rows = statsQueries.map((q) => q.data!);
    const byDate = new Map<string, OrderStatsDaily>();
    for (const s of rows) {
      for (const d of s.dailyRevenue) {
        const cur = byDate.get(d.date) ?? { date: d.date, revenue: 0, orders: 0 };
        byDate.set(d.date, { date: d.date, revenue: cur.revenue + d.revenue, orders: cur.orders + d.orders });
      }
    }
    return {
      totalRevenue: rows.reduce((a, s) => a + s.totalRevenue, 0),
      totalOrders: rows.reduce((a, s) => a + s.totalOrders, 0),
      totalTicketsSold: rows.reduce((a, s) => a + s.totalTicketsSold, 0),
      dailyRevenue: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    };
  }, [eventIds, statsQueries]);

  const events = data?.data ?? [];
  const now = Date.now();
  const upcoming = events
    .filter((e) => e.status === "PUBLISHED" && new Date(e.endTime).getTime() > now)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .slice(0, 5);
  const attention = events.filter((e) => e.status === "DRAFT" || e.status === "REJECTED" || e.status === "PENDING_APPROVAL");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl">Thống kê</h1>
        <Link to="/kenh-to-chuc/su-kien/moi" className="btn-primary">
          + Tạo sự kiện mới
        </Link>
      </div>

      {overview && (
        <div>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Doanh thu (30 ngày)" value={formatVnd(overview.totalRevenue)} />
            <StatCard label="Đơn đã thanh toán" value={String(overview.totalOrders)} />
            <StatCard label="Vé đã bán" value={String(overview.totalTicketsSold)} />
          </div>
          <div className="card mt-4 p-5">
            <p className="mb-3 text-sm font-bold text-ink-700">Doanh thu theo ngày (tất cả sự kiện)</p>
            <RevenueTrendChart data={overview.dailyRevenue} />
          </div>
        </div>
      )}

      {isLoading ? (
        <PageSpinner />
      ) : events.length === 0 ? (
        <EmptyState title="Chưa có sự kiện nào" description="Tạo sự kiện đầu tiên để bắt đầu bán vé." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-ink-700">Sắp diễn ra</p>
              <Link to="/kenh-to-chuc/su-kien" className="text-sm font-semibold text-brand-600 hover:underline">
                Tất cả sự kiện →
              </Link>
            </div>
            {upcoming.length === 0 ? (
              <p className="mt-3 text-sm text-ink-400">Không có sự kiện đang bán nào sắp diễn ra.</p>
            ) : (
              <div className="mt-3 divide-y divide-ink-100">
                {upcoming.map((e) => (
                  <Link key={e.id} to={`/kenh-to-chuc/su-kien/${e.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-brand-600">
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
            <p className="text-sm font-bold text-ink-700">Cần chú ý</p>
            {attention.length === 0 ? (
              <p className="mt-3 text-sm text-ink-400">Không có sự kiện nào đang chờ xử lý.</p>
            ) : (
              <div className="mt-3 divide-y divide-ink-100">
                {attention.map((e) => (
                  <Link key={e.id} to={`/kenh-to-chuc/su-kien/${e.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-brand-600">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink-900">{e.title}</p>
                      <p className="text-xs text-ink-500">
                        {e.status === "DRAFT" && "Bản nháp — hoàn thiện vé rồi gửi duyệt"}
                        {e.status === "PENDING_APPROVAL" && "Đang chờ quản trị viên duyệt"}
                        {e.status === "REJECTED" && `Bị từ chối: ${e.rejectedReason ?? ""}`}
                      </p>
                    </div>
                    <Badge tone={EVENT_STATUS_TONE[e.status]}>{EVENT_STATUS_LABEL[e.status]}</Badge>
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
