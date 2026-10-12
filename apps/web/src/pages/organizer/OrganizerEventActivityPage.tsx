import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { EVENT_SCOPED_SOURCES, type ActivitySource } from "../../api/activity";
import { eventsApi } from "../../api/events";
import { ActivityFeed } from "../../components/activity/ActivityFeed";

const VIEWS: Array<{ label: string; sources: ActivitySource[] }> = [
  { label: "Tất cả", sources: EVENT_SCOPED_SOURCES },
  { label: "Quản lý sự kiện", sources: ["event"] },
  { label: "Mua vé & thanh toán", sources: ["booking", "payment"] },
  { label: "Vé & check-in", sources: ["ticket"] },
];

/**
 * Per-event log for its organizer (docs/spec/14-activity-log-design.md §1):
 * who changed the event, who bought tickets, refunds, check-ins and
 * refused scans. Buyers' IP/device are withheld by the backend.
 */
export function OrganizerEventActivityPage() {
  const { id = "" } = useParams();
  const { data: event } = useQuery({ queryKey: ["event", id], queryFn: () => eventsApi.getById(id) });
  const [view, setView] = useState(VIEWS[0]);

  return (
    <div>
      <Link to={`/kenh-to-chuc/su-kien/${id}`} className="text-sm font-semibold text-ink-500 hover:text-ink-700">
        ← {event?.title ?? "Sự kiện"}
      </Link>
      <h2 className="mt-2 text-lg font-bold text-ink-800">Nhật ký sự kiện</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <button
            key={v.label}
            onClick={() => setView(v)}
            className={`rounded-full px-3 py-1 text-sm font-semibold ${v === view ? "bg-ink-800 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"}`}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div className="mt-4">
        <ActivityFeed scope={{ kind: "event", eventId: id }} sources={view.sources} />
      </div>
    </div>
  );
}
