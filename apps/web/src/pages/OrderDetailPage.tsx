import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { bookingApi, ORDER_STATUS_LABEL } from "../api/booking";
import { eventsApi } from "../api/events";
import { CustomerRefundPanel } from "../components/refunds/CustomerRefundPanel";
import { Badge } from "../components/ui/Badge";
import { PageSpinner } from "../components/ui/Spinner";
import { formatDateTime, formatVnd } from "../lib/format";
import { orderItemLabel } from "../lib/orderTickets";

export function OrderDetailPage() {
  const { id = "" } = useParams();
  const { data: order, isLoading } = useQuery({ queryKey: ["order", id], queryFn: () => bookingApi.getOrder(id) });
  const { data: event } = useQuery({
    queryKey: ["event", order?.eventId],
    queryFn: () => eventsApi.getById(order!.eventId!),
    enabled: !!order?.eventId,
  });

  if (isLoading || !order) return <PageSpinner />;

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
        {order.kind === "MEMBERSHIP" && (
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-ink-100 pb-4">
            <div>
              <p className="font-bold text-ink-900">{order.itemLabel ?? "Thẻ thành viên"}</p>
              <p className="text-sm text-ink-500">Thẻ thành viên nghệ sĩ</p>
            </div>
            <Link to="/the-thanh-vien" className="text-sm font-semibold text-brand-600 hover:underline">
              Xem thẻ →
            </Link>
          </div>
        )}
        {event && (
          <div className="mb-4 border-b border-ink-100 pb-4">
            <Link to={`/su-kien/${event.id}`} className="font-bold text-ink-900 hover:text-brand-600">
              {event.title}
            </Link>
            <p className="text-sm text-ink-500">{event.venueName}</p>
          </div>
        )}
        <div className="space-y-2 text-sm">
          {order.items.map((item, index) => (
            <div key={item.id} className="flex justify-between">
              <span className={item.refundedAt ? "text-ink-400 line-through" : "text-ink-600"}>
                {orderItemLabel(item, event, index)}
                {item.quantity > 1 && ` × ${item.quantity}`}
                {item.refundedAt && <span className="ml-2 text-xs no-underline">(đã hoàn)</span>}
              </span>
              <span className="font-semibold">{formatVnd(Number(item.price) * item.quantity)}</span>
            </div>
          ))}
        </div>
        {Number(order.memberDiscountAmount ?? 0) > 0 && (
          <div className="mt-3 flex justify-between text-sm text-emerald-700">
            <span>Ưu đãi thẻ thành viên</span>
            <span className="font-semibold">−{formatVnd(order.memberDiscountAmount!)}</span>
          </div>
        )}
        {Number(order.discountAmount) > 0 && (
          <div className="mt-1 flex justify-between text-sm text-emerald-700">
            <span>Mã giảm giá {order.discountCode}</span>
            <span className="font-semibold">−{formatVnd(order.discountAmount)}</span>
          </div>
        )}
        <div className="mt-4 flex justify-between border-t border-ink-100 pt-4 text-base font-extrabold">
          <span>Tổng cộng</span>
          <span className="text-brand-600">{formatVnd(order.totalAmount)}</span>
        </div>
        {Number(order.refundedAmount) > 0 && (
          <div className="mt-1 flex justify-between text-sm text-emerald-700">
            <span>Đã hoàn</span>
            <span className="font-semibold">−{formatVnd(order.refundedAmount)}</span>
          </div>
        )}
      </div>

      {order.kind !== "MEMBERSHIP" && (order.status === "TICKET_ISSUED" || order.status === "PAID" || order.status === "CANCELED") && (
        <CustomerRefundPanel order={order} event={event} />
      )}
    </div>
  );
}
