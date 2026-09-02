import { api } from "./client";
import type { Order, OrderStatus, Paginated } from "./types";

export interface HoldCartItem {
  ticketTypeId?: string;
  seatId?: string;
  quantity?: number;
}

export const bookingApi = {
  hold: (eventId: string, items: HoldCartItem[]) =>
    api.post<Order>("/booking/cart/hold", { eventId, items }).then((r) => r.data),

  applyDiscount: (orderId: string, code: string) =>
    api.post<Order>(`/booking/orders/${orderId}/apply-discount`, { code }).then((r) => r.data),

  getOrder: (orderId: string) => api.get<Order>(`/booking/orders/${orderId}`).then((r) => r.data),

  myOrders: (params: { page?: number; limit?: number; status?: OrderStatus } = {}) =>
    api.get<Paginated<Order>>("/booking/orders", { params }).then((r) => r.data),

  cancel: (orderId: string) => api.post<Order>(`/booking/orders/${orderId}/cancel`).then((r) => r.data),
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Chờ thanh toán",
  PAID: "Đã thanh toán",
  TICKET_ISSUED: "Đã phát vé",
  CANCELED: "Đã hủy",
  EXPIRED: "Hết hạn giữ chỗ",
};
