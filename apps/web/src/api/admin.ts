import { api } from "./client";
import type { Paginated, User } from "./types";

export const adminApi = {
  users: (params: { page?: number; limit?: number; role?: string } = {}) =>
    api.get<Paginated<User> | User[]>("/user/users", { params }).then((r) => r.data),

  lockUser: (id: string, isLocked: boolean) =>
    api.patch<User>(`/user/users/${id}/lock`, { isLocked }).then((r) => r.data),

  verifyOrganizer: (id: string) => api.patch<User>(`/user/users/${id}/verify-organizer`).then((r) => r.data),
};
