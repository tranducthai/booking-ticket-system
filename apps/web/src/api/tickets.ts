import { api } from "./client";
import type { Paginated, Ticket } from "./types";

export const ticketsApi = {
  mine: (params: { page?: number; limit?: number } = {}) =>
    api.get<Paginated<Ticket>>("/ticket/tickets/mine", { params }).then((r) => r.data),

  get: (id: string) => api.get<Ticket>(`/ticket/tickets/${id}`).then((r) => r.data),

  checkIn: (id: string, qrPayload: string) =>
    api.post<Ticket>(`/ticket/tickets/${id}/check-in`, { qrPayload }).then((r) => r.data),

  attendees: (eventId: string) => api.get<Ticket[]>(`/ticket/events/${eventId}/attendees`).then((r) => r.data),
};
