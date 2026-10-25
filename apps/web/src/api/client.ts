import axios, { AxiosError } from "axios";
import { FormError } from "../lib/validation";
import type { AuthResponse } from "./types";

const STORAGE_KEY = "ticketbox.auth";

export interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  user: AuthResponse["user"];
}

export function loadAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredAuth) : null;
  } catch {
    return null;
  }
}

export function saveAuth(auth: StoredAuth | null): void {
  if (auth) localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
  else localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event("auth-changed"));
}

// Base URL: dev uses Vite's /api proxy (vite.config.ts) straight to the
// gateway; a real deployment sets VITE_API_BASE_URL to the gateway's origin.
// Exported for the OAuth login buttons (LoginPage/RegisterPage) — those are
// plain <a> full-page navigations to user-service's redirect endpoints, not
// axios calls, so they need the raw base URL rather than the api instance.
// "||" not "??" — .env.example ships VITE_API_BASE_URL empty-but-present on
// purpose for local dev, and an empty string is falsy but not nullish, so
// "??" would never fall through to the default and every request would go
// out with no base path at all (hits Vite's dev server directly instead of
// its /api proxy, gets index.html back instead of JSON).
export const baseURL = `${import.meta.env.VITE_API_BASE_URL || "/api"}`;

export const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const auth = loadAuth();
  if (auth?.accessToken) {
    config.headers.Authorization = `Bearer ${auth.accessToken}`;
  }
  return config;
});

// One-shot message for the login page after this tab was signed out by the
// server (e.g. the account logged in on another device). Per tab, so only
// the tab that hit it shows it.
const FLASH_KEY = "ticketbox.auth.flash";

export function peekAuthFlash(): string | null {
  try {
    return sessionStorage.getItem(FLASH_KEY);
  } catch {
    return null;
  }
}

export function clearAuthFlash(): void {
  try {
    sessionStorage.removeItem(FLASH_KEY);
  } catch {
    // storage unavailable — nothing to clear
  }
}

function setAuthFlash(message: string): void {
  try {
    sessionStorage.setItem(FLASH_KEY, message);
  } catch {
    // storage unavailable — the user just won't see why they were signed out
  }
}

// Refresh-on-401 per docs/spec/05-project-structure-and-tech-stack.md §2.
// Single-flight: concurrent 401s share one refresh call instead of each
// firing their own POST /user/auth/refresh.
let refreshInFlight: Promise<string | null> | null = null;

/**
 * Refresh tokens are single-use (user-service rotates them and treats a
 * re-used one as theft, revoking the session), so two tabs must never
 * refresh with the same token: the Web Lock serializes refreshes across
 * tabs, and a tab that waited re-reads storage first — if another tab has
 * already swapped the token it was holding, it just uses the new one.
 */
async function refreshAccessToken(failedAccessToken: string | undefined): Promise<string | null> {
  const run = async (): Promise<string | null> => {
    const auth = loadAuth();
    if (!auth?.refreshToken) return null;
    if (failedAccessToken && auth.accessToken !== failedAccessToken) return auth.accessToken;
    try {
      const res = await axios.post<AuthResponse>(`${baseURL}/user/auth/refresh`, {
        refreshToken: auth.refreshToken,
      });
      saveAuth(res.data);
      return res.data.accessToken;
    } catch (err) {
      // Only a definitive answer ends the session — a network error or a
      // 5xx (service asleep, Redis down) must not log the user out.
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status !== undefined && status >= 400 && status < 500 && status !== 429) {
        const data = (err as AxiosError<{ code?: string; message?: string }>).response?.data;
        if (data?.code === "SESSION_REPLACED" && data.message) setAuthFlash(data.message);
        saveAuth(null);
      }
      return null;
    }
  };
  return typeof navigator !== "undefined" && navigator.locks ? navigator.locks.request("ticketbox-auth-refresh", run) : run();
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (typeof error.config & { _retried?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retried) {
      original._retried = true;
      const sent = original.headers?.Authorization;
      const failedToken = typeof sent === "string" ? sent.replace(/^Bearer /, "") : undefined;
      refreshInFlight ??= refreshAccessToken(failedToken).finally(() => {
        refreshInFlight = null;
      });
      const token = await refreshInFlight;
      if (token) {
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${token}`;
        return api.request(original);
      }
    }
    return Promise.reject(error);
  },
);

export function apiErrorMessage(err: unknown, fallback = "Đã có lỗi xảy ra, vui lòng thử lại."): string {
  // A client-side check (lib/validation.ts check()) failed before any request went out.
  if (err instanceof FormError) return err.message;
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string | string[] } | undefined;
    if (Array.isArray(data?.message)) return data.message.join(", ");
    if (typeof data?.message === "string") return data.message;
  }
  return fallback;
}
