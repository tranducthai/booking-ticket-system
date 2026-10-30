import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { bookingApi, ORDER_STATUS_LABEL } from "../api/booking";
import type { OrderStatus } from "../api/types";
import { AccountLayout } from "../components/account/AccountLayout";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";
import { PageSpinner } from "../components/ui/Spinner";
import { formatDateTime, formatVnd } from "../lib/format";

const STATUS_TONE: Record<OrderStatus, "brand" | "success" | "danger" | "neutral" | "warning"> = {
  PENDING_PAYMENT: "warning",
  PAID: "success",
  TICKET_ISSUED: "success",
  CANCELED: "neutral",
  EXPIRED: "danger",
};

export function OrdersPage() {
  const { data, isLoading } = useQuery({ queryKey: ["orders", "mine"], queryFn: () => bookingApi.myOrders({ limit: 50 }) });
  // An order still awaiting payment isn't a purchase yet (it expires by itself), so it isn't listed.
  const orders = (data?.data ?? []).filter((o) => o.status !== "PENDING_PAYMENT");

  return (
    <AccountLayout title="Lịch sử đơn hàng" crumbs={[{ label: "Đơn hàng của tôi", to: "/my-tickets" }, { label: "Lịch sử đơn hàng" }]}>

      {isLoading ? (
        <PageSpinner />
      ) : orders.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="Chưa có đơn hàng nào" description="Khám phá sự kiện và đặt vé đầu tiên của bạn." />
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {orders.map((order) => {
            const to = `/orders/${order.id}`;
            return (
              <Link key={order.id} to={to} className="card flex items-center justify-between p-5 hover:shadow-lg">
                <div>
                  <p className="font-mono text-xs text-ink-400">#{order.id.slice(0, 8)}</p>
                  <p className="mt-1 text-sm text-ink-500">{formatDateTime(order.createdAt)}</p>
                  <p className="mt-1 text-sm text-ink-600">{order.kind === "MEMBERSHIP" ? order.itemLabel ?? "Thẻ thành viên" : `${order.items.length} vé`}</p>
                </div>
                <div className="text-right">
                  <Badge tone={STATUS_TONE[order.status]}>{ORDER_STATUS_LABEL[order.status]}</Badge>
                  <p className="mt-2 font-bold text-ink-900">{formatVnd(order.totalAmount)}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </AccountLayout>
  );
}
