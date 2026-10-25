import { api } from "./client";
import type { Artist, ArtistDetail, Membership, MembershipPlan, Paginated } from "./types";

export const artistsApi = {
  /** Public. `verified: true` for the homepage carousel/directory; omitted + `q` for the organizer's lineup picker. */
  search: (params: { q?: string; verified?: boolean; page?: number; limit?: number } = {}) =>
    api.get<Paginated<Artist>>("/event/artists", { params }).then((r) => r.data),

  getById: (id: string) => api.get<ArtistDetail>(`/event/artists/${id}`).then((r) => r.data),

  create: (data: { name: string; avatarUrl?: string; bio?: string }) =>
    api.post<Artist>("/event/artists", data).then((r) => r.data),

  /** Admin: create or edit the artist's membership card. */
  savePlan: (artistId: string, data: Omit<MembershipPlan, "id" | "artistId" | "price"> & { price: number }) =>
    api.put<MembershipPlan>(`/event/artists/${artistId}/membership-plan`, data).then((r) => r.data),

  lineup: {
    attach: (eventId: string, artistId: string) =>
      api.post(`/event/events/${eventId}/artists`, { artistId }).then((r) => r.data),
    detach: (eventId: string, artistId: string) => api.delete(`/event/events/${eventId}/artists/${artistId}`).then((r) => r.data),
  },
};

export const membershipsApi = {
  mine: (status: "active" | "expired" | "canceled") =>
    api.get<Membership[]>("/event/memberships/mine", { params: { status } }).then((r) => r.data),
  cancel: (id: string) => api.post<Membership>(`/event/memberships/${id}/cancel`).then((r) => r.data),
};
