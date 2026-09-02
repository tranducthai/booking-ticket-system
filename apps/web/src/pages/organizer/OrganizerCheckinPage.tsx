import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiErrorMessage } from "../../api/client";
import { eventsApi } from "../../api/events";
import { ticketsApi } from "../../api/tickets";
import type { Ticket } from "../../api/types";

/**
 * Manual QR-payload paste instead of a camera scanner — keeps this demo
 * dependency-free. A real deployment would swap the textarea for a camera
 * scan library feeding the same checkIn() call.
 */
export function OrganizerCheckinPage() {
  const { id = "" } = useParams();
  const { data: event } = useQuery({ queryKey: ["event", id], queryFn: () => eventsApi.getById(id) });
  const [ticketId, setTicketId] = useState("");
  const [qrPayload, setQrPayload] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string; ticket?: Ticket } | null>(null);

  const mutation = useMutation({
    mutationFn: () => ticketsApi.checkIn(ticketId.trim(), qrPayload.trim()),
    onSuccess: (ticket) => {
      setResult({ ok: true, message: "Check-in thành công — cho khách vào.", ticket });
      setTicketId("");
      setQrPayload("");
    },
    onError: (err) => setResult({ ok: false, message: apiErrorMessage(err, "Vé không hợp lệ.") }),
  });

  return (
    <div>
      <Link to={`/kenh-to-chuc/su-kien/${id}`} className="text-sm font-semibold text-ink-500 hover:text-ink-700">
        ← {event?.title ?? "Sự kiện"}
      </Link>
      <h2 className="mt-2 text-lg font-bold text-ink-800">Quét check-in</h2>

      <div className="card mt-4 max-w-lg p-6">
        <label className="label">Mã vé (ticketId)</label>
        <input value={ticketId} onChange={(e) => setTicketId(e.target.value)} className="input font-mono text-sm" />
        <label className="label mt-3">Nội dung QR (qrPayload)</label>
        <textarea value={qrPayload} onChange={(e) => setQrPayload(e.target.value)} className="input min-h-[100px] font-mono text-xs" />

        {result && (
          <div className={`mt-4 rounded-lg px-4 py-3 text-sm ${result.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
            {result.message}
          </div>
        )}

        <button
          onClick={() => {
            setResult(null);
            mutation.mutate();
          }}
          disabled={!ticketId || !qrPayload || mutation.isPending}
          className="btn-primary mt-4 w-full py-3"
        >
          {mutation.isPending ? "Đang kiểm tra..." : "Xác nhận check-in"}
        </button>
      </div>
    </div>
  );
}
