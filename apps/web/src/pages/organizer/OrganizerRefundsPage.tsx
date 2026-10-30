import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { eventsApi } from "../../api/events";
import { RefundQueue } from "../../components/refunds/RefundQueue";

/** Organizer's refund queue for one of their events (docs/spec/13-refund-and-anti-fraud-design.md §2.2). */
export function OrganizerRefundsPage() {
  const { id = "" } = useParams();
  const { data: event } = useQuery({ queryKey: ["event", id], queryFn: () => eventsApi.getById(id) });

  return (
    <div>
      <Link to={`/organizer/events/${id}`} className="text-sm font-semibold text-ink-500 hover:text-ink-700">
        ← {event?.title ?? "Sự kiện"}
      </Link>
      <h2 className="mt-2 text-lg font-bold text-ink-800">Yêu cầu hoàn vé</h2>
      <p className="mt-1 text-sm text-ink-500">
        Hãy xử lý trong 7 ngày — quá hạn, khách có thể khiếu nại lên quản trị viên. Vé của yêu cầu đang mở bị khóa, không check-in được.
      </p>
      <div className="mt-4">
        <RefundQueue eventId={id} isAdmin={false} />
      </div>
    </div>
  );
}
