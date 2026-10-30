import { api } from "./client";
import type { Paginated, User } from "./types";

export interface InvitePartnerInput {
  email: string;
  fullName: string;
  phone?: string;
}

export const adminApi = {
  users: (params: { page?: number; limit?: number; role?: string; q?: string } = {}) =>
    api.get<Paginated<User> | User[]>("/user/users", { params }).then((r) => r.data),

  lockUser: (id: string, isLocked: boolean) =>
    api.patch<User>(`/user/users/${id}/lock`, { isLocked }).then((r) => r.data),

  verifyOrganizer: (id: string) => api.patch<User>(`/user/users/${id}/verify-organizer`).then((r) => r.data),

  /** Edit a partner's name, phone (null clears it), avatar and organizer description. The email is their login and can't change here. */
  updatePartner: (id: string, data: { fullName: string; phone: string | null; avatarUrl?: string; organizerDescription: string }) => api.patch<User>(`/user/users/${id}/partner`, data).then((r) => r.data),

  /** Email a partner organizer an invitation; their account is created once they set a password from the link. */
  invitePartner: (data: InvitePartnerInput) =>
    api.post<{ ok: true; email: string; expiresAt: string }>("/user/partner-invites", data).then((r) => r.data),
};

/** Public — the invitee isn't signed in; the emailed token is the credential. */
export const partnerInviteApi = {
  preview: (token: string) => api.get<{ email: string; fullName: string }>("/user/partner-invites/preview", { params: { token } }).then((r) => r.data),
  accept: (token: string, password: string) => api.post<{ ok: true; email: string }>("/user/partner-invites/accept", { token, password }).then((r) => r.data),
};

/** Every organizer account, for pickers and name lookups (admin console scale: a few hundred at most). */
export async function fetchOrganizers(): Promise<User[]> {
  const data = await adminApi.users({ role: "ORGANIZER", limit: 100 });
  return Array.isArray(data) ? data : data.data;
}
