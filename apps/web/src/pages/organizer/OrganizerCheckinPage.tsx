import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiErrorMessage } from "../../api/client";
import { eventsApi } from "../../api/events";
import { ticketsApi } from "../../api/tickets";

/**
 * Manual paste of the scanned QR content instead of a camera scanner —
 * keeps this demo dependency-free. A real deployment would swap the
 * textarea for a camera scan library (or a USB/2D scanner, which types the
 * code into a focused field) feeding the same checkIn() call. The event is
 * fixed by the URL: the backend refuses tickets of any other event
 * (docs/spec/13-refund-and-anti-fraud-design.md §3.3).
 */
export function OrganizerCheckinPage() {
  const { id = "" } = useParams();
  const { data: event } = useQuery({ queryKey: ["event", id], queryFn: () => eventsApi.getById(id) });
  const [code, setCode] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string; nationalId?: string } | null>(null);

  const mutation = useMutation({
    mutationFn: () => ticketsApi.checkIn(id, code.trim()),
    onSuccess: (ticket) => {
      setResult({ ok: true, message: `Check-in thành công vé #${ticket.id.slice(0, 8)} — đối chiếu CCCD rồi cho khách vào.`, nationalId: ticket.nationalId });
      setCode("");
    },
    onError: (err) => {
      setResult({ ok: false, message: apiErrorMessage(err, "Vé không hợp lệ.") });
      setCode("");
    },
  });

  return (
    <div>
      <Link to={`/organizer/events/${id}`} className="text-sm font-semibold text-ink-500 hover:text-ink-700">
        ← {event?.title ?? "Sự kiện"}
      </Link>
      <h2 className="mt-2 text-lg font-bold text-ink-800">Quét check-in</h2>

      <form
        className="card mt-4 max-w-lg p-6"
        onSubmit={(e) => {
          e.preventDefault();
          setResult(null);
          if (code.trim()) mutation.mutate();
        }}
      >
        <label className="label">Nội dung mã QR</label>
        <textarea
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="TBX2.… (mã QR trên vé)"
          className="input min-h-[100px] font-mono text-xs"
        />
        <p className="mt-1 text-xs text-ink-400">Mã QR chứa số CCCD của chủ vé — đối chiếu với CCCD khách xuất trình.</p>

        {result && (
          <div className={`mt-4 rounded-lg px-4 py-3 text-sm ${result.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
            {result.message}
            {result.nationalId && (
              <p className="mt-2 text-base font-bold text-ink-900">
                CCCD: <span className="font-mono tracking-wider">{result.nationalId}</span>
              </p>
            )}
          </div>
        )}

        <button type="submit" disabled={!code.trim() || mutation.isPending} className="btn-primary mt-4 w-full py-3">
          {mutation.isPending ? "Đang kiểm tra..." : "Xác nhận check-in"}
        </button>
      </form>
    </div>
  );
}
