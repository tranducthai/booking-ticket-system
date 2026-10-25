import { api } from "./client";
import type { EventItem, Order, Paginated, ResaleListing } from "./types";

export const RESALE_STATUS_LABEL: Record<ResaleListing["status"], string> = {
  ACTIVE: "Đang bán",
  RESERVED: "Có người đang thanh toán",
  SOLD: "Đã bán",
  CANCELED: "Đã huỷ",
};

export const resaleApi = {
  /** Public marketplace (ACTIVE listings). */
  list: (params: { eventId?: string; page?: number; limit?: number } = {}) =>
    api.get<Paginated<ResaleListing>>("/booking/resale/listings", { params }).then((r) => r.data),
  mine: () => api.get<ResaleListing[]>("/booking/resale/listings/mine").then((r) => r.data),
  config: () => api.get<{ feePercent: number }>("/booking/resale/config").then((r) => r.data),
  create: (ticketId: string, price: number) => api.post<ResaleListing>("/booking/resale/listings", { ticketId, price }).then((r) => r.data),
  cancel: (id: string) => api.delete<ResaleListing>(`/booking/resale/listings/${id}`).then((r) => r.data),
  /** Reserves the ticket and returns a RESALE order to pay at /thanh-toan/:id. */
  buy: (id: string) => api.post<Order>(`/booking/resale/listings/${id}/buy`).then((r) => r.data),
  /** Events whose organizer reopened unsold tickets after the deadline. */
  lateSales: () => api.get<EventItem[]>("/event/events/late-sales").then((r) => r.data),
  /** Organizer: reopen unsold tickets until `until` (null closes it). */
  setLateSales: (eventId: string, until: string | null) => api.patch<EventItem>(`/event/events/${eventId}/late-sales`, { until }).then((r) => r.data),
};
