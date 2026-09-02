import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiErrorMessage } from "../../api/client";
import { EVENT_STATUS_LABEL, eventsApi } from "../../api/events";
import { Badge } from "../../components/ui/Badge";
import { PageSpinner } from "../../components/ui/Spinner";
import { formatDateTime, formatVnd } from "../../lib/format";
import { SeatMapBuilder } from "../../components/organizer/SeatMapBuilder";
import { TicketTypeManager } from "../../components/organizer/TicketTypeManager";
import { DiscountCodeManager } from "../../components/organizer/DiscountCodeManager";

export function OrganizerEventDetailPage() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const { data: event, isLoading } = useQuery({ queryKey: ["event", id], queryFn: () => eventsApi.getById(id) });
  const [error, setError] = useState<string | null>(null);

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
          {(event.status === "DRAFT" || event.status === "REJECTED") && (
            <button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending} className="btn-primary">
              {submitMutation.isPending ? "Đang gửi..." : "Gửi duyệt sự kiện"}
            </button>
          )}
          <Link to={`/su-kien/${event.id}`} className="btn-secondary">
            Xem trang công khai
          </Link>
          <Link to={`/kenh-to-chuc/su-kien/${event.id}/khach-tham-du`} className="btn-secondary">
            Danh sách khách
          </Link>
          <Link to={`/kenh-to-chuc/su-kien/${event.id}/check-in`} className="btn-secondary">
            Quét check-in
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

      {event.ticketMode === "GENERAL" ? (
        <TicketTypeManager event={event} />
      ) : (
        <SeatMapBuilder eventId={event.id} />
      )}

      <DiscountCodeManager eventId={event.id} />
    </div>
  );
}
