import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { EVENT_STATUS_LABEL, eventsApi } from "../../api/events";
import type { EventStatus } from "../../api/types";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageSpinner } from "../../components/ui/Spinner";
import { formatDateTime } from "../../lib/format";

const STATUS_TONE: Record<EventStatus, "neutral" | "warning" | "success" | "danger"> = {
  DRAFT: "neutral",
  PENDING_APPROVAL: "warning",
  PUBLISHED: "success",
  REJECTED: "danger",
  CANCELED: "neutral",
};

export function OrganizerDashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ["events", "mine"], queryFn: () => eventsApi.myEvents({ limit: 50 }) });

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-bold text-ink-800">Sự kiện của bạn</h2>
        <Link to="/kenh-to-chuc/su-kien/moi" className="btn-primary">
          + Sự kiện mới
        </Link>
      </div>

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
