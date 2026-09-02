import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiErrorMessage } from "../api/client";
import { bookingApi, ORDER_STATUS_LABEL } from "../api/booking";
import { eventsApi } from "../api/events";
import { paymentApi } from "../api/payment";
import { Badge } from "../components/ui/Badge";
import { PageSpinner } from "../components/ui/Spinner";
import { formatDateTime, formatVnd } from "../lib/format";

export function OrderDetailPage() {
  const { id = "" } = useParams();
  const { data: order, isLoading } = useQuery({ queryKey: ["order", id], queryFn: () => bookingApi.getOrder(id) });
  const { data: event } = useQuery({
    queryKey: ["event", order?.eventId],
    queryFn: () => eventsApi.getById(order!.eventId),
    enabled: !!order,
  });

  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const refundMutation = useMutation({
    mutationFn: () => paymentApi.refunds.request(id, reason),
    onSuccess: () => setMessage("Đã gửi yêu cầu hoàn tiền — chờ ban tổ chức/quản trị viên duyệt."),
    onError: (err) => setMessage(apiErrorMessage(err, "Không thể gửi yêu cầu hoàn tiền.")),
  });

  if (isLoading || !order) return <PageSpinner />;

  const canRefund = order.status === "PAID" || order.status === "TICKET_ISSUED";

  return (
    <div className="container-page max-w-3xl py-10">
      <Link to="/don-hang" className="text-sm font-semibold text-ink-500 hover:text-ink-700">
        ← Đơn hàng của tôi
      </Link>
      <div className="mt-3 flex items-center justify-between">
        <h1 className="text-2xl">Đơn hàng #{order.id.slice(0, 8)}</h1>
        <Badge tone={order.status === "PAID" || order.status === "TICKET_ISSUED" ? "success" : "neutral"}>
          {ORDER_STATUS_LABEL[order.status]}
        </Badge>
      </div>
      <p className="mt-1 text-sm text-ink-500">Đặt lúc {formatDateTime(order.createdAt)}</p>

      <div className="card mt-6 p-6">
        {event && (
          <div className="mb-4 border-b border-ink-100 pb-4">
            <Link to={`/su-kien/${event.id}`} className="font-bold text-ink-900 hover:text-brand-600">
              {event.title}
            </Link>
            <p className="text-sm text-ink-500">{event.venueName}</p>
          </div>
        )}
        <div className="space-y-2 text-sm">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between">
              <span className="text-ink-600">
                {item.seatId ? `Ghế` : `Vé`} × {item.quantity}
              </span>
              <span className="font-semibold">{formatVnd(Number(item.price) * item.quantity)}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-between border-t border-ink-100 pt-4 text-base font-extrabold">
          <span>Tổng cộng</span>
          <span className="text-brand-600">{formatVnd(order.totalAmount)}</span>
        </div>
      </div>

      {canRefund && (
        <div className="card mt-4 p-6">
          <h2 className="text-base font-bold text-ink-800">Yêu cầu hoàn vé</h2>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Lý do hoàn vé..."
            className="input mt-3 min-h-[80px]"
          />
          {message && <p className="mt-2 text-sm text-ink-600">{message}</p>}
          <button
            onClick={() => refundMutation.mutate()}
            disabled={!reason || refundMutation.isPending}
            className="btn-secondary mt-3"
          >
            Gửi yêu cầu hoàn tiền
          </button>
        </div>
      )}
    </div>
  );
}
