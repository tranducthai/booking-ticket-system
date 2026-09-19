import { api } from "./client";
import type { AppNotification, Paginated } from "./types";

export const notificationsApi = {
  list: (params: { page?: number; limit?: number } = {}) =>
    api.get<Paginated<AppNotification>>("/notification/notifications", { params }).then((r) => r.data),

  unreadCount: () =>
    api.get<{ count: number }>("/notification/notifications/unread-count").then((r) => r.data.count),

  markRead: (id: string) =>
    api.patch<{ updated: number }>(`/notification/notifications/${id}/read`).then((r) => r.data),

  markAllRead: () => api.patch<{ updated: number }>("/notification/notifications/read-all").then((r) => r.data),
};
