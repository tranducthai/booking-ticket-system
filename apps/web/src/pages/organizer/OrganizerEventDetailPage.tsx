import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchOrganizers } from "../../api/admin";
import { apiErrorMessage } from "../../api/client";
import { bookingApi } from "../../api/booking";
import { EVENT_STATUS_LABEL, eventsApi } from "../../api/events";
import { Badge } from "../../components/ui/Badge";
import { PageSpinner } from "../../components/ui/Spinner";
import { formatDateTime, formatVnd } from "../../lib/format";
import { SeatMapBuilder } from "../../components/organizer/SeatMapBuilder";
import { ShowtimeManager } from "../../components/organizer/ShowtimeManager";
import { TicketTypeManager } from "../../components/organizer/TicketTypeManager";
import { DiscountCodeManager } from "../../components/organizer/DiscountCodeManager";
import { ArtistLineupManager } from "../../components/organizer/ArtistLineupManager";
import { EventDetailsEditor } from "../../components/organizer/EventDetailsEditor";
import { EventLifecycleManager } from "../../components/organizer/EventLifecycleManager";
import { RevenueTrendChart } from "../../components/stats/RevenueTrendChart";
import { StatCard } from "../../components/stats/StatCard";
import { categorySupportsLineup } from "../../lib/categories";

/**
 * One event's management page. The admin console reuses it (`asAdmin`) for
 * any partner's event: same editors (details, ticket types / seat map,
 * discount codes, lineup), plus who owns it, "publish now" instead of
 * "submit for approval", and admin cancel — minus the organizer-only pages.
 */
export function OrganizerEventDetailPage({ asAdmin = false }: { asAdmin?: boolean } = {}) {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const { data: event, isLoading } = useQuery({ queryKey: ["event", id], queryFn: () => eventsApi.getById(id) });
  const [error, setError] = useState<string | null>(null);
  const { data: organizers } = useQuery({ queryKey: ["admin", "organizers"], queryFn: fetchOrganizers, enabled: asAdmin });
  const owner = organizers?.find((o) => o.id === event?.organizerId);

  const publishMutation = useMutation({
    mutationFn: () => eventsApi.approve(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["event", id] });
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (err) => setError(apiErrorMessage(err, "Không thể đăng bán sự kiện.")),
  });

  const submitMutation = useMutation({
    mutationFn: () => eventsApi.submit(id),
    onSuccess: (updated) => qc.setQueryData(["event", id], updated),
    onError: (err) => setError(apiErrorMessage(err, "Không thể gửi duyệt.")),
  });

  const highDemandMutation = useMutation({
    mutationFn: (enabled: boolean) => eventsApi.setHighDemand(id, enabled),
    onSuccess: (updated) => qc.setQueryData(["event", id], updated),
    onError: (err) => setError(apiErrorMessage(err, "Không thể đổi trạng thái phòng chờ.")),
  });

  const { data: stats } = useQuery({
    queryKey: ["orders", "stats", id],
    queryFn: () => bookingApi.stats({ eventId: id, days: 30 }),
    enabled: !!event,
  });

  if (isLoading || !event) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-ink-900">{event.title}</h2>
            <p className="mt-1 text-sm text-ink-500">
              {formatDateTime(event.startTime)} · {event.venueName}
            </p>
            {asAdmin && (
              <p className="mt-1 text-sm text-ink-500">
                Ban tổ chức:{" "}
                <Link to={"/quan-tri/su-kien?doi-tac=" + event.organizerId} className="font-semibold text-ink-800 hover:text-brand-600">
                  {owner?.fullName ?? event.organizerId}
                </Link>
                {owner && <span className="text-ink-400"> · {owner.email}</span>}
              </p>
            )}
          </div>
          <Badge
            tone={
              event.status === "PUBLISHED"
                ? "success"
                : event.status === "PENDING_APPROVAL"
                  ? "warning"
                  : event.status === "REJECTED"
                    ? "danger"
                    : "neutral"
            }
          >
            {EVENT_STATUS_LABEL[event.status]}
          </Badge>
        </div>

        {event.status === "REJECTED" && event.rejectedReason && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">Lý do từ chối: {event.rejectedReason}</p>
        )}
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
          {asAdmin && ["DRAFT", "REJECTED", "PENDING_APPROVAL"].includes(event.status) && (
            <button
              onClick={() => confirm("Đăng bán \"" + event.title + "\" ngay?") && publishMutation.mutate()}
              disabled={publishMutation.isPending}
              className="btn-primary"
            >
              {publishMutation.isPending ? "Đang đăng..." : "Đăng bán ngay"}
            </button>
          )}
          {!asAdmin && (event.status === "DRAFT" || event.status === "REJECTED") && (
            <button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending} className="btn-primary">
              {submitMutation.isPending ? "Đang gửi..." : "Gửi duyệt sự kiện"}
            </button>
          )}
          <Link to={`/su-kien/${event.id}`} className="btn-secondary">
            Xem trang công khai
          </Link>
        </div>

        <label className="mt-4 flex items-center gap-2 border-t border-ink-100 pt-4 text-sm text-ink-600">
          <input
            type="checkbox"
            checked={event.highDemand}
            disabled={highDemandMutation.isPending}
            onChange={(e) => highDemandMutation.mutate(e.target.checked)}
          />
          Bật phòng chờ (waiting room) — dùng khi dự đoán lượng truy cập tăng đột biến
        </label>
      </div>

      {stats && (
        <div className="card p-6">
          <h3 className="text-base font-bold text-ink-800">Doanh thu (30 ngày)</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <StatCard label="Doanh thu" value={formatVnd(stats.totalRevenue)} />
            <StatCard label="Đơn đã thanh toán" value={String(stats.totalOrders)} />
            <StatCard label="Vé đã bán" value={String(stats.totalTicketsSold)} />
          </div>
          <div className="mt-4">
            <RevenueTrendChart data={stats.dailyRevenue} />
          </div>
        </div>
      )}

      <EventLifecycleManager event={event} asAdmin={asAdmin} />

      <EventDetailsEditor key={event.id} event={event} />

      {event.ticketMode === "GENERAL" ? (
        <>
          <ShowtimeManager event={event} />
          <TicketTypeManager event={event} />
        </>
      ) : (
        <SeatMapBuilder eventId={event.id} />
      )}

      <DiscountCodeManager eventId={event.id} />

      {categorySupportsLineup(event.category?.slug) && (
        <ArtistLineupManager eventId={event.id} lineup={event.lineup ?? []} />
      )}
    </div>
  );
}
