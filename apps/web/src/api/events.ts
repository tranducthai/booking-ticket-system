import { api } from "./client";
import type {
  Category,
  CursorPage,
  DiscountCode,
  EventItem,
  EventPrivateInfo,
  EventStatus,
  Paginated,
  RefundPolicy,
  SeatMapLayout,
  SeatMapState,
  Showtime,
  TicketDeliveryMethod,
  TicketMode,
  TicketType,
  WaitingRoomStatus,
} from "./types";

export interface SearchEventsParams {
  categoryId?: string;
  location?: string;
  keyword?: string;
  minPrice?: number;
  maxPrice?: number;
  startDateFrom?: string;
  startDateTo?: string;
  cursor?: string;
  limit?: number;
}

export interface RecommendedEvent {
  id: string;
  title: string;
  bannerUrl: string | null;
  startTime: string;
  endTime: string;
  venueName: string;
  city: string;
  category: Category | null;
  minPrice: number | null;
  score: number;
  /** Why it was suggested, e.g. "Cùng nghệ sĩ X" — null when no single reason stands out. */
  reason: string | null;
}

/** An event row in a back-office list: the event plus tickets sold / available (event-service withSalesTotals). */
export type AdminEventRow = EventItem & { ticketsSold: number; ticketsTotal: number };

/** The descriptive fields of an event (event-service CreateEventDto/UpdateEventDto) — null clears minAge. */
export interface EventDetailsInput {
  description: string;
  organizerName: string;
  organizerLogoUrl: string;
  organizerDescription: string;
  terms: string;
  minAge: number | null;
  zoneMapUrl: string;
}

/** Optional per-tier settings (event-service CreateTicketTypeDto) — null clears maxPerOrder. */
export interface TicketTypeInput {
  deliveryMethod: TicketDeliveryMethod;
  description: string;
  minPerOrder: number;
  maxPerOrder: number | null;
  isHidden: boolean;
}

export const eventsApi = {
  search: (params: SearchEventsParams) =>
    api.get<CursorPage<EventItem>>("/event/events", { params }).then((r) => r.data),

  // queueSession: set once a waiting-room join has admitted this session
  // (see waitingRoomApi below) — a normal (non-high_demand) event ignores
  // the header entirely, so it's always safe to pass.
  getById: (id: string, queueSession?: string) =>
    api
      .get<EventItem>(`/event/events/${id}`, { headers: queueSession ? { "x-queue-session": queueSession } : {} })
      .then((r) => r.data),

  setHighDemand: (id: string, enabled: boolean) =>
    api.patch<EventItem>(`/event/events/${id}/high-demand`, { enabled }).then((r) => r.data),

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
    galleryUrls?: string[];
    maxTicketsPerAccount?: number;
    refundPolicy?: RefundPolicy;
    isOnline?: boolean;
    province?: string;
    ward?: string;
    streetAddress?: string;
    /** Admin only — the partner organizer who will own the event. */
    organizerId?: string;
  } & Partial<EventDetailsInput>) => api.post<EventItem>("/event/events", data).then((r) => r.data),

  /** Admin console: every event, any status, with sales totals — event-service GET /events/admin. */
  adminList: (params: { status?: EventStatus; q?: string; organizerId?: string; page?: number; limit?: number } = {}) =>
    api.get<Paginated<AdminEventRow>>("/event/events/admin", { params }).then((r) => r.data),

  update: (id: string, data: Partial<EventItem>) => api.patch<EventItem>(`/event/events/${id}`, data).then((r) => r.data),

  /** Online join link + payout/invoice details (event-service events.controller.ts private-info). */
  privateInfo: {
    get: (id: string) => api.get<EventPrivateInfo>(`/event/events/${id}/private-info`).then((r) => r.data),
    save: (id: string, data: Partial<Omit<EventPrivateInfo, "eventId">>) =>
      api.put<EventPrivateInfo>(`/event/events/${id}/private-info`, data).then((r) => r.data),
  },

  submit: (id: string) => api.post<EventItem>(`/event/events/${id}/submit`).then((r) => r.data),

  approve: (id: string) => api.patch<EventItem>(`/event/events/${id}/approve`).then((r) => r.data),

  reject: (id: string, reason: string) =>
    api.patch<EventItem>(`/event/events/${id}/reject`, { reason }).then((r) => r.data),

  /** The organizer's own events, any status, with sales totals. */
  myEvents: (params: { page?: number; limit?: number } = {}) =>
    api.get<Paginated<AdminEventRow>>("/event/events/mine", { params }).then((r) => r.data),

  // docs/spec/13-refund-and-anti-fraud-design.md §2.3/§2.4
  requestCancel: (id: string, reason: string) =>
    api.post<EventItem>(`/event/events/${id}/cancel-request`, { reason }).then((r) => r.data),
  cancelRequests: (params: { page?: number; limit?: number } = {}) =>
    api.get<Paginated<EventItem>>("/event/events/cancel-requests", { params }).then((r) => r.data),
  rejectCancelRequest: (id: string, reason: string) =>
    api.patch<EventItem>(`/event/events/${id}/cancel-request/reject`, { reason }).then((r) => r.data),
  cancel: (id: string, reason?: string) =>
    api.patch<EventItem>(`/event/events/${id}/cancel`, reason ? { reason } : {}).then((r) => r.data),
  postpone: (id: string, data: { startTime: string; endTime: string }) =>
    api.patch<EventItem>(`/event/events/${id}/postpone`, data).then((r) => r.data),

  pendingApproval: (params: { page?: number; limit?: number } = {}) =>
    api.get<Paginated<EventItem>>("/event/events/pending", { params }).then((r) => r.data),

  ticketTypes: {
    create: (eventId: string, data: { name: string; price: number; quantityTotal: number; showtimeId?: string } & Partial<TicketTypeInput>) =>
      api.post<TicketType>(`/event/events/${eventId}/ticket-types`, data).then((r) => r.data),
    update: (id: string, data: Partial<{ name: string; price: number; quantityTotal: number } & TicketTypeInput>) =>
      api.patch<TicketType>(`/event/ticket-types/${id}`, data).then((r) => r.data),
  },

  /** Multi-date events — event-service showtimes.controller.ts. */
  showtimes: {
    create: (eventId: string, data: { items: { startTime: string; endTime: string }[]; copyTicketTypesFrom?: string }) =>
      api.post<Showtime[]>(`/event/events/${eventId}/showtimes`, data).then((r) => r.data),
    remove: (id: string) => api.delete(`/event/showtimes/${id}`).then((r) => r.data),
  },

  /** "Có thể bạn cũng thích" — event-service recommendations (hybrid content + co-favorites). */
  recommendations: (eventId: string, limit = 8) =>
    api.get<RecommendedEvent[]>(`/event/events/${eventId}/recommendations`, { params: { limit } }).then((r) => r.data),

  seatMap: {
    getLayout: (eventId: string) => api.get<SeatMapLayout>(`/event/events/${eventId}/seat-map/layout`).then((r) => r.data),
    getState: (eventId: string, queueSession?: string) =>
      api
        .get<SeatMapState>(`/event/events/${eventId}/seat-map/state`, {
          headers: queueSession ? { "x-queue-session": queueSession } : {},
        })
        .then((r) => r.data),
    createOrReplace: (
      eventId: string,
      data: {
        zones: Array<{ name: string; price: number; isGeneral?: boolean; capacity?: number; rows?: number; seatsPerRow?: number }>;
      },
    ) => api.post<SeatMapLayout>(`/event/events/${eventId}/seat-map`, data).then((r) => r.data),
    blockSeat: (seatId: string) => api.patch(`/event/seats/${seatId}/block`).then((r) => r.data),
  },

  discountCodes: {
    create: (
      eventId: string,
      data: {
        code: string;
        discountType: "PERCENT" | "FIXED";
        value: number;
        quantityTotal: number;
        validFrom?: string;
        validTo?: string;
      },
    ) => api.post<DiscountCode>(`/event/events/${eventId}/discount-codes`, data).then((r) => r.data),
    validate: (eventId: string, code: string) =>
      api.get<DiscountCode>("/event/discount-codes/validate", { params: { eventId, code } }).then((r) => r.data),
    list: (eventId: string) => api.get<DiscountCode[]>(`/event/events/${eventId}/discount-codes`).then((r) => r.data),
    update: (
      id: string,
      data: Partial<{
        value: number;
        quantityTotal: number;
        validFrom: string | null;
        validTo: string | null;
        isActive: boolean;
      }>,
    ) => api.patch<DiscountCode>(`/event/discount-codes/${id}`, data).then((r) => r.data),
    remove: (id: string) => api.delete<void>(`/event/discount-codes/${id}`).then((r) => r.data),
  },
};

export const favoritesApi = {
  mine: (params: { page?: number; limit?: number } = {}) =>
    api.get<Paginated<EventItem & { favoritedAt: string }>>("/event/events/favorites/mine", { params }).then((r) => r.data),

  ids: (eventIds: string[]) =>
    eventIds.length === 0
      ? Promise.resolve<string[]>([])
      : api
          .get<{ eventIds: string[] }>("/event/events/favorites/ids", { params: { eventIds: eventIds.join(",") } })
          .then((r) => r.data.eventIds),

  add: (eventId: string) => api.post<{ favorited: boolean }>(`/event/events/${eventId}/favorite`).then((r) => r.data),

  remove: (eventId: string) => api.delete<{ favorited: boolean }>(`/event/events/${eventId}/favorite`).then((r) => r.data),
};

export const waitingRoomApi = {
  join: (eventId: string, sessionId: string) =>
    api.post<WaitingRoomStatus>(`/event/events/${eventId}/waiting-room/join`, { sessionId }).then((r) => r.data),
  status: (eventId: string, sessionId: string) =>
    api.get<WaitingRoomStatus>(`/event/events/${eventId}/waiting-room/status`, { params: { sessionId } }).then((r) => r.data),
};

export const EVENT_STATUS_TONE: Record<EventStatus, "neutral" | "brand" | "success" | "warning" | "danger"> = {
  DRAFT: "neutral",
  PENDING_APPROVAL: "warning",
  PUBLISHED: "success",
  REJECTED: "danger",
  CANCELED: "danger",
};

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  DRAFT: "Nháp",
  PENDING_APPROVAL: "Chờ duyệt",
  PUBLISHED: "Đã công khai",
  REJECTED: "Bị từ chối",
  CANCELED: "Đã hủy",
};
