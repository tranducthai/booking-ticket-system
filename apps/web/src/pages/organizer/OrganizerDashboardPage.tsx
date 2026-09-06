import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { bookingApi } from "../../api/booking";
import { EVENT_STATUS_LABEL, eventsApi } from "../../api/events";
import type { EventStatus, OrderStatsDaily } from "../../api/types";
import { RevenueTrendChart } from "../../components/stats/RevenueTrendChart";
import { StatCard } from "../../components/stats/StatCard";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageSpinner } from "../../components/ui/Spinner";
import { formatDateTime, formatVnd } from "../../lib/format";

const STATUS_TONE: Record<EventStatus, "neutral" | "warning" | "success" | "danger"> = {
  DRAFT: "neutral",
  PENDING_APPROVAL: "warning",
  PUBLISHED: "success",
  REJECTED: "danger",
  CANCELED: "neutral",
};

export function OrganizerDashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ["events", "mine"], queryFn: () => eventsApi.myEvents({ limit: 50 }) });
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

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-bold text-ink-800">Sự kiện của bạn</h2>
        <Link to="/kenh-to-chuc/su-kien/moi" className="btn-primary">
          + Sự kiện mới
        </Link>
      </div>

      {overview && (
        <div className="mb-6">
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
      ) : data?.data.length === 0 ? (
        <EmptyState title="Chưa có sự kiện nào" description="Tạo sự kiện đầu tiên để bắt đầu bán vé." />
      ) : (
        <div className="space-y-3">
          {data?.data.map((event) => (
            <Link
              key={event.id}
              to={`/kenh-to-chuc/su-kien/${event.id}`}
              className="card flex items-center justify-between p-5 hover:shadow-lg"
            >
              <div>
                <p className="font-bold text-ink-900">{event.title}</p>
                <p className="mt-1 text-sm text-ink-500">
                  {formatDateTime(event.startTime)} · {event.venueName}
                </p>
              </div>
              <Badge tone={STATUS_TONE[event.status]}>{EVENT_STATUS_LABEL[event.status]}</Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
