import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { eventsApi } from "../../api/events";
import { TICKET_STATUS_LABEL, TICKET_STATUS_TONE, ticketsApi } from "../../api/tickets";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageSpinner } from "../../components/ui/Spinner";
import { formatDateTime } from "../../lib/format";

export function OrganizerAttendeesPage() {
  const { id = "" } = useParams();
  const { data: event } = useQuery({ queryKey: ["event", id], queryFn: () => eventsApi.getById(id) });
  const { data: attendees, isLoading } = useQuery({ queryKey: ["attendees", id], queryFn: () => ticketsApi.attendees(id) });

  return (
    <div>
      <Link to={`/organizer/events/${id}`} className="text-sm font-semibold text-ink-500 hover:text-ink-700">
        ← {event?.title ?? "Sự kiện"}
      </Link>
      <h2 className="mt-2 text-lg font-bold text-ink-800">Danh sách khách tham dự</h2>

      {isLoading ? (
        <PageSpinner />
      ) : attendees?.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="Chưa có vé nào được phát hành" />
        </div>
      ) : (
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-left text-xs uppercase text-ink-400">
              <tr>
                <th className="px-4 py-3">Mã vé</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3">Phát hành</th>
                <th className="px-4 py-3">Check-in</th>
              </tr>
            </thead>
            <tbody>
              {attendees?.map((t) => (
                <tr key={t.id} className="border-t border-ink-100">
                  <td className="px-4 py-3 font-mono text-xs">{t.id.slice(0, 8)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={TICKET_STATUS_TONE[t.status]}>
                      {t.status === "ISSUED" ? "Chưa dùng" : t.status === "USED" ? "Đã check-in" : TICKET_STATUS_LABEL[t.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-ink-500">{formatDateTime(t.createdAt)}</td>
                  <td className="px-4 py-3 text-ink-500">{t.checkedInAt ? formatDateTime(t.checkedInAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
