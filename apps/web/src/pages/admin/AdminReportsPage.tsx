import { useQueries, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { bookingApi } from "../../api/booking";
import { eventsApi } from "../../api/events";
import { RevenueTrendChart } from "../../components/stats/RevenueTrendChart";
import { StatCard } from "../../components/stats/StatCard";
import { PageSpinner } from "../../components/ui/Spinner";
import { formatVnd } from "../../lib/format";

const RANGE_OPTIONS = [
  { days: 7, label: "7 ngày" },
  { days: 30, label: "30 ngày" },
  { days: 90, label: "90 ngày" },
];

export function AdminReportsPage() {
  const [days, setDays] = useState(30);
  const { data: stats, isLoading } = useQuery({
    queryKey: ["orders", "stats", "system", days],
    queryFn: () => bookingApi.stats({ days }),
  });

  const topEvents = stats?.topEvents ?? [];
  const eventTitleQueries = useQueries({
    queries: topEvents.map((e) => ({
      queryKey: ["event", e.eventId],
      queryFn: () => eventsApi.getById(e.eventId),
      staleTime: 60_000,
    })),
  });

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-bold text-ink-800">Báo cáo thống kê hệ thống</h2>
        <div className="flex gap-2">
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                days === r.days ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading || !stats ? (
        <PageSpinner />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label={`Doanh thu (${days} ngày)`} value={formatVnd(stats.totalRevenue)} />
            <StatCard label="Đơn đã thanh toán" value={String(stats.totalOrders)} />
            <StatCard label="Vé đã bán" value={String(stats.totalTicketsSold)} />
          </div>

          <div className="card p-6">
            <h3 className="text-base font-bold text-ink-800">Doanh thu theo ngày</h3>
            <div className="mt-4">
              <RevenueTrendChart data={stats.dailyRevenue} />
            </div>
          </div>

          <div className="card p-6">
            <h3 className="text-base font-bold text-ink-800">Sự kiện nổi bật (theo doanh thu)</h3>
            {topEvents.length === 0 ? (
              <p className="mt-3 text-sm text-ink-400">Chưa có doanh thu trong khoảng thời gian này.</p>
            ) : (
              <div className="mt-3 divide-y divide-ink-100">
                {topEvents.map((e, i) => (
                  <div key={e.eventId} className="flex items-center justify-between py-3 text-sm">
                    <Link to={`/su-kien/${e.eventId}`} className="font-semibold text-ink-800 hover:text-brand-600">
                      {eventTitleQueries[i]?.data?.title ?? e.eventId}
                    </Link>
                    <div className="text-right">
                      <p className="font-bold text-brand-600">{formatVnd(e.revenue)}</p>
                      <p className="text-xs text-ink-400">{e.orders} đơn</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
