import { api } from "./client";
import type { Paginated, User } from "./types";

export interface CreatePartnerInput {
  email: string;
  fullName: string;
  password: string;
  phone?: string;
  avatarUrl?: string;
}

export const adminApi = {
  users: (params: { page?: number; limit?: number; role?: string; q?: string } = {}) =>
    api.get<Paginated<User> | User[]>("/user/users", { params }).then((r) => r.data),

  lockUser: (id: string, isLocked: boolean) =>
    api.patch<User>(`/user/users/${id}/lock`, { isLocked }).then((r) => r.data),

  verifyOrganizer: (id: string) => api.patch<User>(`/user/users/${id}/verify-organizer`).then((r) => r.data),

  /** Onboard a partner organizer directly — user-service POST /users/partners. */
  createPartner: (data: CreatePartnerInput) => api.post<User>("/user/users/partners", data).then((r) => r.data),
};

/** Every organizer account, for pickers and name lookups (admin console scale: a few hundred at most). */
export async function fetchOrganizers(): Promise<User[]> {
  const data = await adminApi.users({ role: "ORGANIZER", limit: 100 });
  return Array.isArray(data) ? data : data.data;
}
