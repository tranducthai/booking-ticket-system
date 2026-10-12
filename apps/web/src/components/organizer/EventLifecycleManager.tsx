import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiErrorMessage } from "../../api/client";
import { eventsApi } from "../../api/events";
import type { EventItem } from "../../api/types";
import { formatDateTime } from "../../lib/format";

const MIN_CANCEL_NOTICE_HOURS = 72; // mirrors event-service events.service.ts

/** ISO -> value for <input type="datetime-local"> in the browser's local time. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/**
 * Organizer side of docs/spec/13-refund-and-anti-fraud-design.md §2.3/§2.4:
 * postpone (immediate, buyers get a 100% refund window) or ask an admin to
 * cancel (sales stop now; admin approval voids every ticket and refunds
 * every buyer 100%).
 */
export function EventLifecycleManager({ event }: { event: EventItem }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<null | "postpone" | "cancel">(null);
  const [reason, setReason] = useState("");
  const [startTime, setStartTime] = useState(toLocalInput(event.startTime));
  const [endTime, setEndTime] = useState(toLocalInput(event.endTime));
  const [error, setError] = useState<string | null>(null);

  const onSuccess = (updated: EventItem) => {
    qc.setQueryData(["event", event.id], updated);
    setMode(null);
    setError(null);
  };
  const postpone = useMutation({
    mutationFn: () => eventsApi.postpone(event.id, { startTime: new Date(startTime).toISOString(), endTime: new Date(endTime).toISOString() }),
    onSuccess,
    onError: (err) => setError(apiErrorMessage(err, "Không thể dời sự kiện.")),
  });
  const requestCancel = useMutation({
    mutationFn: () => eventsApi.requestCancel(event.id, reason),
    onSuccess,
    onError: (err) => setError(apiErrorMessage(err, "Không thể gửi yêu cầu hủy.")),
  });

  if (event.status === "CANCELED") {
    return (
      <div className="card p-6">
        <h3 className="text-base font-bold text-red-700">Sự kiện đã bị hủy</h3>
        <p className="mt-1 text-sm text-ink-600">
          {event.canceledAt && `Lúc ${formatDateTime(event.canceledAt)}. `}Lý do: {event.cancelReason}. Toàn bộ vé đã bị vô hiệu và người mua được hoàn 100% tự động.
        </p>
      </div>
    );
  }
  if (event.status !== "PUBLISHED") return null;

  const hoursUntilStart = (new Date(event.startTime).getTime() - Date.now()) / 3_600_000;

  return (
    <div className="card p-6">
      <h3 className="text-base font-bold text-ink-800">Dời lịch / hủy sự kiện</h3>

      {event.postponedAt && event.refundWindowEndsAt && (
        <p className="mt-2 text-sm text-ink-600">
          Đã dời lịch lúc {formatDateTime(event.postponedAt)} — người mua được hoàn 100% đến {formatDateTime(event.refundWindowEndsAt)}.
        </p>
      )}

      {event.cancelRequestedAt ? (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Đã gửi yêu cầu hủy lúc {formatDateTime(event.cancelRequestedAt)} — đang chờ quản trị viên duyệt. Sự kiện đã ngừng bán vé.
          <br />
          Lý do: {event.cancelRequestReason}
        </p>
      ) : (
        <>
          {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          {mode === null && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => setMode("postpone")} className="btn-secondary">
                Dời lịch
              </button>
              <button onClick={() => setMode("cancel")} className="btn-danger">
                Yêu cầu hủy sự kiện
              </button>
            </div>
          )}

          {mode === "postpone" && (
            <form
              className="mt-3 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                postpone.mutate();
              }}
            >
              <p className="text-sm text-ink-600">Vé đã bán vẫn có hiệu lực cho ngày mới. Người mua sẽ được thông báo và có 14 ngày để yêu cầu hoàn 100% (không cần duyệt).</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Bắt đầu mới</label>
                  <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="input" required />
                </div>
                <div>
                  <label className="label">Kết thúc mới</label>
                  <input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="input" required />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={postpone.isPending} className="btn-primary">
                  {postpone.isPending ? "Đang lưu..." : "Xác nhận dời lịch"}
                </button>
                <button type="button" onClick={() => setMode(null)} className="btn-ghost">
                  Hủy
                </button>
              </div>
            </form>
          )}

          {mode === "cancel" && (
            <form
              className="mt-3 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (confirm("Gửi yêu cầu hủy? Sự kiện sẽ ngừng bán vé ngay.")) requestCancel.mutate();
              }}
            >
              {hoursUntilStart < MIN_CANCEL_NOTICE_HOURS ? (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                  Còn chưa đến {MIN_CANCEL_NOTICE_HOURS} giờ trước giờ diễn — không thể tự gửi yêu cầu hủy. Vui lòng liên hệ quản trị viên để xử lý khẩn cấp.
                </p>
              ) : (
                <>
                  <p className="text-sm text-ink-600">
                    Quản trị viên sẽ xem xét. Khi được duyệt, toàn bộ vé bị vô hiệu và người mua được hoàn 100% — chi phí hoàn do ban tổ chức chịu.
                  </p>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Lý do hủy (tối thiểu 10 ký tự) — người mua sẽ thấy nội dung này"
                    className="input min-h-[80px]"
                  />
                </>
              )}
              <div className="flex gap-2">
                {hoursUntilStart >= MIN_CANCEL_NOTICE_HOURS && (
                  <button type="submit" disabled={requestCancel.isPending || reason.trim().length < 10} className="btn-danger">
                    {requestCancel.isPending ? "Đang gửi..." : "Gửi yêu cầu hủy"}
                  </button>
                )}
                <button type="button" onClick={() => setMode(null)} className="btn-ghost">
                  Đóng
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
