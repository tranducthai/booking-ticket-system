import { api } from "./client";
import type { AuthResponse, User } from "./types";

export const authApi = {
  register: (data: { email: string; password: string; fullName: string; phone?: string }) =>
    api.post<AuthResponse>("/user/auth/register", data).then((r) => r.data),

  login: (data: { email: string; password: string }) =>
    api.post<AuthResponse>("/user/auth/login", data).then((r) => r.data),

  me: () => api.get<User>("/user/users/me").then((r) => r.data),

  updateMe: (data: Partial<Pick<User, "fullName" | "phone">>) =>
    api.patch<User>("/user/users/me", data).then((r) => r.data),
};
