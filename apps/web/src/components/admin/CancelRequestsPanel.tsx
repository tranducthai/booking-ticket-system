import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { check, rules } from "../../lib/validation";
import { useState } from "react";
import { apiErrorMessage } from "../../api/client";
import { eventsApi } from "../../api/events";
import { formatDateTime } from "../../lib/format";
import { EmptyState } from "../ui/EmptyState";

/**
 * Admin queue of organizer cancellation requests + a direct cancel for
 * emergencies (docs/spec/13-refund-and-anti-fraud-design.md §2.3).
 * Approving voids every ticket and refunds every buyer 100% — irreversible,
 * hence the confirm.
 */
export function CancelRequestsPanel() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin", "cancel-requests"], queryFn: () => eventsApi.cancelRequests({ limit: 100 }) });
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [directId, setDirectId] = useState("");
  const [directReason, setDirectReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "cancel-requests"] });
  const onError = (err: unknown) => setError(apiErrorMessage(err));

  const approve = useMutation({
    mutationFn: (id: string) => eventsApi.cancel(id),
    onSuccess: (event) => {
      setNotice(`Đã hủy "${event.title}" — đang hoàn tiền tự động cho người mua.`);
      void refresh();
    },
    onError,
  });
  const reject = useMutation({
    mutationFn: (id: string) => {
      check(rules.length(reason, "Lý do từ chối", 1, 2000));
      return eventsApi.rejectCancelRequest(id, reason.trim());
    },
    onSuccess: () => {
      setRejecting(null);
      setReason("");
      void refresh();
    },
    onError,
  });
  const direct = useMutation({
    mutationFn: () => {
      check(
        /^[0-9a-f-]{36}$/i.test(directId.trim()) ? null : "Mã sự kiện (UUID) không hợp lệ",
        rules.length(directReason, "Lý do hủy", 10, 2000),
      );
      return eventsApi.cancel(directId.trim(), directReason.trim());
    },
    onSuccess: (event) => {
      setNotice(`Đã hủy "${event.title}" — đang hoàn tiền tự động cho người mua.`);
      setDirectId("");
      setDirectReason("");
    },
    onError,
  });

  const requests = data?.data ?? [];

  return (
    <div className="mt-10">
      <h2 className="text-lg font-bold text-ink-800">Yêu cầu hủy sự kiện</h2>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {notice && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}

      {requests.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="Không có yêu cầu hủy nào" />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {requests.map((event) => (
            <div key={event.id} className="card p-5">
              <p className="font-bold text-ink-900">{event.title}</p>
              <p className="mt-1 text-sm text-ink-500">
                Diễn ra {formatDateTime(event.startTime)} · yêu cầu lúc {event.cancelRequestedAt && formatDateTime(event.cancelRequestedAt)}
              </p>
              <p className="mt-2 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-700">Lý do: {event.cancelRequestReason}</p>

              {rejecting === event.id ? (
                <div className="mt-3 space-y-2">
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do không chấp nhận hủy..." className="input" />
                  <div className="flex gap-2">
                    <button onClick={() => reject.mutate(event.id)} disabled={!reason.trim()} className="btn-secondary">
                      Xác nhận
                    </button>
                    <button onClick={() => setRejecting(null)} className="btn-ghost">
                      Đóng
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => {
                      if (confirm(`Hủy "${event.title}"? Toàn bộ vé bị vô hiệu và người mua được hoàn 100%. Không thể hoàn tác.`)) approve.mutate(event.id);
                    }}
                    disabled={approve.isPending}
                    className="btn-danger"
                  >
                    Duyệt hủy & hoàn tiền
                  </button>
                  <button onClick={() => setRejecting(event.id)} className="btn-secondary">
                    Không chấp nhận
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <details className="card mt-4 p-5">
        <summary className="cursor-pointer text-sm font-semibold text-ink-700">Hủy khẩn cấp một sự kiện (không cần yêu cầu từ ban tổ chức)</summary>
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (confirm("Hủy sự kiện này? Toàn bộ vé bị vô hiệu và người mua được hoàn 100%. Không thể hoàn tác.")) direct.mutate();
          }}
        >
          <input value={directId} onChange={(e) => setDirectId(e.target.value)} placeholder="ID sự kiện" className="input font-mono text-sm" />
          <textarea value={directReason} onChange={(e) => setDirectReason(e.target.value)} placeholder="Lý do (tối thiểu 10 ký tự)" className="input" />
          <button type="submit" disabled={!directId.trim() || directReason.trim().length < 10 || direct.isPending} className="btn-danger">
            Hủy sự kiện
          </button>
        </form>
      </details>
    </div>
  );
}
