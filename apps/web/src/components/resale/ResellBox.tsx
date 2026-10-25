import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { bookingApi } from "../../api/booking";
import { apiErrorMessage } from "../../api/client";
import { resaleApi } from "../../api/resale";
import type { TicketDetail } from "../../api/types";
import { formatVnd } from "../../lib/format";
import { check } from "../../lib/validation";

/**
 * Ticket page: put the ticket up for resale (price ≤ what was paid, fee
 * shown up front), or see / withdraw the open listing.
 */
export function ResellBox({ ticket }: { ticket: TicketDetail }) {
  const qc = useQueryClient();
  const { data: mine } = useQuery({ queryKey: ["resale", "mine"], queryFn: resaleApi.mine });
  const { data: config } = useQuery({ queryKey: ["resale", "config"], queryFn: resaleApi.config, staleTime: Infinity });
  const { data: orders } = useQuery({ queryKey: ["orders", "mine"], queryFn: () => bookingApi.myOrders({ limit: 50 }), enabled: ticket.status === "ISSUED" });
  const facePrice = Number(orders?.data.flatMap((o) => o.items).find((i) => i.id === ticket.orderItemId)?.price ?? 0);
  const open = mine?.find((l) => l.ticketId === ticket.id && (l.status === "ACTIVE" || l.status === "RESERVED"));
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["resale"] });
    void qc.invalidateQueries({ queryKey: ["ticket", ticket.id] });
    void qc.invalidateQueries({ queryKey: ["tickets"] });
  };

  const create = useMutation({
    mutationFn: () => {
      const n = Number(price);
      check(!Number.isInteger(n) || n < 10000 ? "Giá bán lại tối thiểu 10.000đ, số nguyên" : null, facePrice && n > facePrice ? `Giá không được cao hơn giá gốc ${formatVnd(facePrice)}` : null);
      return resaleApi.create(ticket.id, n);
    },
    onSuccess: () => {
      setEditing(false);
      setError(null);
      refresh();
    },
    onError: (err) => setError(apiErrorMessage(err, "Không thể đăng bán lại.")),
  });
  const cancel = useMutation({
    mutationFn: () => resaleApi.cancel(open!.id),
    onSuccess: refresh,
    onError: (err) => setError(apiErrorMessage(err, "Không thể huỷ tin bán.")),
  });

  if (ticket.status !== "ISSUED" && ticket.status !== "RESALE_LISTED") return null;
  const fee = config ? Math.round((Number(price || 0) * config.feePercent) / 100) : 0;

  return (
    <div className="border-t border-ink-100 p-6">
      <p className="label">Bán lại vé</p>
      {open ? (
        <div className="text-sm text-ink-600">
          <p>
            Đang rao bán <span className="font-mono">{open.code}</span> giá <strong>{formatVnd(open.price)}</strong>
            {open.status === "RESERVED" && " — có người đang thanh toán"}.
          </p>
          <p className="mt-1 text-xs text-ink-500">Trong lúc rao bán, vé tạm khoá: không check-in và không yêu cầu hoàn được.</p>
          <div className="mt-3 flex gap-3">
            <Link to="/ban-lai-ve/cua-toi" className="btn-secondary">
              Xem tin bán
            </Link>
            {open.status === "ACTIVE" && (
              <button onClick={() => window.confirm("Huỷ tin bán? Vé sẽ dùng lại được bình thường.") && cancel.mutate()} disabled={cancel.isPending} className="btn-ghost">
                Huỷ tin bán
              </button>
            )}
          </div>
        </div>
      ) : editing ? (
        <div className="space-y-3 text-sm">
          <div>
            <input
              type="number"
              min={10000}
              max={facePrice || undefined}
              step={1000}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="input"
              placeholder={facePrice ? `Tối đa ${formatVnd(facePrice)}` : "Giá bán (đ)"}
            />
            {facePrice > 0 && <p className="mt-1 text-xs text-ink-500">Giá gốc {formatVnd(facePrice)} — không bán cao hơn giá gốc.</p>}
          </div>
          {Number(price) > 0 && config && (
            <p className="rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600">
              Phí nền tảng {config.feePercent}%: {formatVnd(fee)} · Bạn nhận <strong className="text-emerald-700">{formatVnd(Number(price) - fee)}</strong> khi vé được bán.
            </p>
          )}
          <div className="flex gap-3">
            <button onClick={() => create.mutate()} disabled={create.isPending} className="btn-primary">
              {create.isPending ? "Đang đăng..." : "Đăng bán"}
            </button>
            <button onClick={() => setEditing(false)} className="btn-ghost">
              Thôi
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs text-ink-500">Không thể tham dự? Rao bán lại vé trên EventPass — người mua nhận vé mới, vé này sẽ bị vô hiệu khi bán xong.</p>
          <button
            onClick={() => {
              setPrice(facePrice ? String(facePrice) : "");
              setEditing(true);
            }}
            className="btn-secondary mt-3 w-full"
          >
            Bán lại vé
          </button>
        </>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
