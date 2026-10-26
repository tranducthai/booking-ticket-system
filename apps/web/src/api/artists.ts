import { api } from "./client";
import type { Artist, ArtistDetail, ArtistPost, Membership, MembershipPlan, MyArtist, Paginated } from "./types";

export const artistsApi = {
  /** Organizer: artists they created or use in their lineups. `canEdit` = their own and still unverified. */
  mine: () => api.get<MyArtist[]>("/event/artists/mine").then((r) => r.data),

  /** Public. `verified: true` for the homepage carousel/directory; omitted + `q` for the organizer's lineup picker. */
  search: (params: { q?: string; verified?: boolean; page?: number; limit?: number } = {}) =>
    api.get<Paginated<Artist>>("/event/artists", { params }).then((r) => r.data),

  getById: (id: string) => api.get<ArtistDetail>(`/event/artists/${id}`).then((r) => r.data),

  /** Organizer/admin: a new (unverified) artist in the shared directory. */
  create: (data: { name: string; avatarUrl?: string; coverUrl?: string; bio?: string; socialLinks?: Record<string, string> }) =>
    api.post<Artist>("/event/artists", data).then((r) => r.data),

  /** Admin: profile fields (shared directory — organizers can't edit an artist). */
  update: (id: string, data: Partial<Pick<Artist, "name" | "avatarUrl" | "coverUrl" | "bio" | "socialLinks">>) =>
    api.patch<Artist>(`/event/artists/${id}`, data).then((r) => r.data),

  /** The signed-in viewer's relation to the artist (anonymous: all false). */
  viewer: (id: string) => api.get<{ following: boolean; isMember: boolean; canPost: boolean }>(`/event/artists/${id}/viewer`).then((r) => r.data),
  follow: (id: string) => api.post<{ following: boolean; followerCount: number }>(`/event/artists/${id}/follow`).then((r) => r.data),
  unfollow: (id: string) => api.delete<{ following: boolean; followerCount: number }>(`/event/artists/${id}/follow`).then((r) => r.data),

  posts: {
    list: (id: string, page = 1) => api.get<Paginated<ArtistPost>>(`/event/artists/${id}/posts`, { params: { page, limit: 10 } }).then((r) => r.data),
    create: (id: string, data: { content: string; imageUrl?: string; membersOnly?: boolean }) =>
      api.post<ArtistPost>(`/event/artists/${id}/posts`, data).then((r) => r.data),
    remove: (id: string, postId: string) => api.delete(`/event/artists/${id}/posts/${postId}`).then((r) => r.data),
  },

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
