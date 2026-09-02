import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, apiErrorMessage } from "../../api/client";
import { EVENT_STATUS_LABEL, eventsApi } from "../../api/events";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageSpinner } from "../../components/ui/Spinner";
import { formatDateTime } from "../../lib/format";

export function AdminEventsApprovalPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "pending-events"],
    queryFn: () => eventsApi.pendingApproval({ limit: 100 }),
  });
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/event/events/${id}/approve`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "pending-events"] }),
    onError: (err) => setError(apiErrorMessage(err)),
  });
  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/event/events/${id}/reject`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "pending-events"] });
      setRejecting(null);
      setReason("");
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const pending = data?.data ?? [];

  if (isLoading) return <PageSpinner />;

  return (
    <div>
      <h2 className="text-lg font-bold text-ink-800">Sự kiện chờ duyệt</h2>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {pending.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="Không có sự kiện nào chờ duyệt" />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {pending.map((event) => (
            <div key={event.id} className="card p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-bold text-ink-900">{event.title}</p>
                  <p className="mt-1 text-sm text-ink-500">
                    {formatDateTime(event.startTime)} · {event.venueName}
                  </p>
                </div>
                <Badge tone="warning">{EVENT_STATUS_LABEL[event.status]}</Badge>
              </div>

              {rejecting === event.id ? (
                <div className="mt-3 space-y-2">
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do từ chối..." className="input" />
                  <div className="flex gap-2">
                    <button onClick={() => rejectMutation.mutate(event.id)} disabled={!reason} className="btn-danger">
                      Xác nhận từ chối
                    </button>
                    <button onClick={() => setRejecting(null)} className="btn-ghost">
                      Hủy
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <button onClick={() => approveMutation.mutate(event.id)} className="btn-primary">
                    Duyệt
                  </button>
                  <button onClick={() => setRejecting(event.id)} className="btn-secondary">
                    Từ chối
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
