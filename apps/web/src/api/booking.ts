import { getQueueSessionId } from "../lib/session";
import { api } from "./client";
import type { Order, OrderStats, OrderStatus, OrganizerStats, Paginated, StatsBucket } from "./types";

export interface HoldCartItem {
  ticketTypeId?: string;
  seatId?: string;
  quantity?: number;
}

export const bookingApi = {
  hold: (eventId: string, items: HoldCartItem[]) =>
    // x-queue-session: high-demand events only accept holds from an admitted waiting-room session.
    api.post<Order>("/booking/cart/hold", { eventId, items }, { headers: { "x-queue-session": getQueueSessionId() } }).then((r) => r.data),

  applyDiscount: (orderId: string, code: string) =>
    api.post<Order>(`/booking/orders/${orderId}/apply-discount`, { code }).then((r) => r.data),

  getOrder: (orderId: string) => api.get<Order>(`/booking/orders/${orderId}`).then((r) => r.data),

  myOrders: (params: { page?: number; limit?: number; status?: OrderStatus } = {}) =>
    api.get<Paginated<Order>>("/booking/orders", { params }).then((r) => r.data),

  cancel: (orderId: string) => api.post<Order>(`/booking/orders/${orderId}/cancel`).then((r) => r.data),

  /** Buy or renew an artist's membership card — pay it at /thanh-toan/:id; a free card comes back already PAID. */
  membershipCheckout: (planId: string) => api.post<Order>("/booking/memberships/checkout", { planId }).then((r) => r.data),

  /** 0đ order (free registration / 100% discount): fulfilled without a payment. */
  confirmFree: (orderId: string) => api.post<Order>(`/booking/orders/${orderId}/confirm-free`).then((r) => r.data),

  /** Organizer's statistics over [from, to) for all their events or one. */
  organizerStats: (params: { eventId?: string; from?: string; to?: string; bucket: StatsBucket }) =>
    api.get<OrganizerStats>("/booking/orders/organizer-stats", { params }).then((r) => r.data),

  /** Omit eventId for admin-only system-wide stats — see orders.controller.ts's stats route. */
  stats: (params: { eventId?: string; days?: number } = {}) =>
    api.get<OrderStats>("/booking/orders/stats", { params }).then((r) => r.data),
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Chờ thanh toán",
  PAID: "Đã thanh toán",
  TICKET_ISSUED: "Đã phát vé",
  CANCELED: "Đã hủy",
  EXPIRED: "Hết hạn giữ chỗ",
};
