import { api } from "./client";
import type { Category, DiscountCode, EventItem, EventStatus, Paginated, SeatMapData, TicketMode, TicketType } from "./types";

export interface SearchEventsParams {
  categoryId?: string;
  location?: string;
  keyword?: string;
  page?: number;
  limit?: number;
}

export const eventsApi = {
  search: (params: SearchEventsParams) => api.get<Paginated<EventItem>>("/event/events", { params }).then((r) => r.data),

  getById: (id: string) => api.get<EventItem>(`/event/events/${id}`).then((r) => r.data),

  categories: () => api.get<Category[]>("/event/categories").then((r) => r.data),

  createCategory: (data: { name: string; slug: string }) =>
    api.post<Category>("/event/categories", data).then((r) => r.data),

  create: (data: {
    title: string;
    categoryId: string;
    venueName: string;
    venueAddress: string;
    startTime: string;
    endTime: string;
    ticketMode: TicketMode;
    description?: string;
    bannerUrl?: string;
  }) => api.post<EventItem>("/event/events", data).then((r) => r.data),

  update: (id: string, data: Partial<EventItem>) => api.patch<EventItem>(`/event/events/${id}`, data).then((r) => r.data),

  submit: (id: string) => api.post<EventItem>(`/event/events/${id}/submit`).then((r) => r.data),

  approve: (id: string) => api.patch<EventItem>(`/event/events/${id}/approve`).then((r) => r.data),

  reject: (id: string, reason: string) =>
    api.patch<EventItem>(`/event/events/${id}/reject`, { reason }).then((r) => r.data),

  myEvents: (params: { page?: number; limit?: number } = {}) =>
    api.get<Paginated<EventItem>>("/event/events/mine", { params }).then((r) => r.data),

  pendingApproval: (params: { page?: number; limit?: number } = {}) =>
    api.get<Paginated<EventItem>>("/event/events/pending", { params }).then((r) => r.data),

  ticketTypes: {
    create: (eventId: string, data: { name: string; price: number; quantityTotal: number }) =>
      api.post<TicketType>(`/event/events/${eventId}/ticket-types`, data).then((r) => r.data),
    update: (id: string, data: Partial<{ name: string; price: number; quantityTotal: number }>) =>
      api.patch<TicketType>(`/event/ticket-types/${id}`, data).then((r) => r.data),
  },

  seatMap: {
    get: (eventId: string) => api.get<SeatMapData>(`/event/events/${eventId}/seat-map`).then((r) => r.data),
    createOrReplace: (
      eventId: string,
      data: {
        zones: Array<{ name: string; price: number; isGeneral?: boolean; capacity?: number; rows?: number; seatsPerRow?: number }>;
      },
    ) => api.post<SeatMapData>(`/event/events/${eventId}/seat-map`, data).then((r) => r.data),
    blockSeat: (seatId: string) => api.patch(`/event/seats/${seatId}/block`).then((r) => r.data),
  },

  discountCodes: {
    create: (
      eventId: string,
      data: { code: string; discountType: "PERCENT" | "FIXED"; value: number; quantityTotal: number },
    ) => api.post<DiscountCode>(`/event/events/${eventId}/discount-codes`, data).then((r) => r.data),
    validate: (eventId: string, code: string) =>
      api.get<DiscountCode>("/event/discount-codes/validate", { params: { eventId, code } }).then((r) => r.data),
  },
};

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  DRAFT: "Nháp",
  PENDING_APPROVAL: "Chờ duyệt",
  PUBLISHED: "Đã công khai",
  REJECTED: "Bị từ chối",
  CANCELED: "Đã hủy",
};
