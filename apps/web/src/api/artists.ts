import { api } from "./client";
import type { Artist, ArtistDetail, Paginated } from "./types";

export const artistsApi = {
  /** Public. `verified: true` for the homepage carousel/directory; omitted + `q` for the organizer's lineup picker. */
  search: (params: { q?: string; verified?: boolean; page?: number; limit?: number } = {}) =>
    api.get<Paginated<Artist>>("/event/artists", { params }).then((r) => r.data),

  getById: (id: string) => api.get<ArtistDetail>(`/event/artists/${id}`).then((r) => r.data),

  create: (data: { name: string; avatarUrl?: string; bio?: string }) =>
    api.post<Artist>("/event/artists", data).then((r) => r.data),

  lineup: {
    attach: (eventId: string, artistId: string) =>
      api.post(`/event/events/${eventId}/artists`, { artistId }).then((r) => r.data),
    detach: (eventId: string, artistId: string) => api.delete(`/event/events/${eventId}/artists/${artistId}`).then((r) => r.data),
  },
};
