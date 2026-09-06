import axios, { AxiosError } from "axios";
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

// Refresh-on-401 per docs/spec/05-project-structure-and-tech-stack.md §2.
// Single-flight: concurrent 401s share one refresh call instead of each
// firing their own POST /user/auth/refresh.
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const auth = loadAuth();
  if (!auth?.refreshToken) return null;
  try {
    const res = await axios.post<AuthResponse>(`${baseURL}/user/auth/refresh`, {
      refreshToken: auth.refreshToken,
    });
    saveAuth(res.data);
    return res.data.accessToken;
  } catch {
    saveAuth(null);
    return null;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (typeof error.config & { _retried?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retried) {
      original._retried = true;
      refreshInFlight ??= refreshAccessToken().finally(() => {
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
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string | string[] } | undefined;
    if (Array.isArray(data?.message)) return data.message.join(", ");
    if (typeof data?.message === "string") return data.message;
  }
  return fallback;
}
