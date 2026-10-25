import { api } from "./client";
import type { Paginated, Ticket, TicketDetail, TicketStatus } from "./types";

export const ticketsApi = {
  mine: (params: { page?: number; limit?: number; eventId?: string } = {}) =>
    api.get<Paginated<Ticket>>("/ticket/tickets/mine", { params }).then((r) => r.data),

  get: (id: string) => api.get<TicketDetail>(`/ticket/tickets/${id}`).then((r) => r.data),

  /** Kills the current QR (static + rotating) and issues a new one — for a suspected leak. */
  reissueQr: (id: string) => api.post<TicketDetail>(`/ticket/tickets/${id}/reissue-qr`).then((r) => r.data),

  /** `code` is whatever the scanner read: a rotating TBX2D code, a static TBX2 code or a legacy v1 payload. */
  checkIn: (eventId: string, code: string) =>
    api.post<Ticket>(`/ticket/events/${eventId}/check-in`, { code }).then((r) => r.data),

  attendees: (eventId: string) => api.get<Ticket[]>(`/ticket/events/${eventId}/attendees`).then((r) => r.data),

  reissueForEvent: (eventId: string) =>
    api.post<{ eventId: string; reissued: number }>(`/ticket/events/${eventId}/tickets/reissue-qr`).then((r) => r.data),
};

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  ISSUED: "Có thể sử dụng",
  REFUND_PENDING: "Đang chờ hoàn tiền",
  RESALE_LISTED: "Đang rao bán lại",
  USED: "Đã sử dụng",
  CANCELED: "Đã hủy",
};

export const TICKET_STATUS_TONE: Record<TicketStatus, "success" | "warning" | "neutral" | "danger"> = {
  ISSUED: "success",
  REFUND_PENDING: "warning",
  RESALE_LISTED: "warning",
  USED: "neutral",
  CANCELED: "danger",
};
