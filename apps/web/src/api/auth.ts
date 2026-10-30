import axios from "axios";
import { api, baseURL } from "./client";
import type { AuthResponse, User } from "./types";

export const authApi = {
  register: (data: { email: string; password: string; fullName: string; phone?: string; accountType?: "CUSTOMER" | "ORGANIZER" }) =>
    api.post<AuthResponse>("/user/auth/register", data).then((r) => r.data),

  login: (data: { email: string; password: string }) =>
    api.post<AuthResponse>("/user/auth/login", data).then((r) => r.data),

  /**
   * Revokes the session server-side, so its access token stops working at
   * the gateway immediately. Plain fetch with keepalive (not the api
   * instance): it must not trigger the refresh-on-401 dance, and must still
   * go out if the page navigates away right after.
   */
  logout: (refreshToken: string) =>
    fetch(`${baseURL}/user/auth/logout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      keepalive: true,
    }).then(
      () => undefined,
      () => undefined,
    ),

  /** OAuth callback: trade the one-time code for tokens. Plain axios — no stale Authorization header from a previous session. */
  oauthExchange: (code: string) => axios.post<AuthResponse>(`${baseURL}/user/auth/oauth/exchange`, { code }).then((r) => r.data),

  /** Always resolves the same way whether or not the email has an account. */
  forgotPassword: (email: string) => api.post<{ ok: true }>("/user/auth/forgot-password", { email }).then((r) => r.data),

  resetPassword: (token: string, newPassword: string) =>
    api.post<{ ok: true }>("/user/auth/reset-password", { token, newPassword }).then((r) => r.data),

  me: () => api.get<User>("/user/users/me").then((r) => r.data),

  updateMe: (data: Partial<Pick<User, "fullName" | "phone" | "avatarUrl" | "dateOfBirth" | "gender" | "nationalId" | "organizerDescription">>) =>
    api.patch<User>("/user/users/me", data).then((r) => r.data),
};
