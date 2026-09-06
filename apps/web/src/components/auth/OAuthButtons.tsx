import { baseURL } from "../../api/client";

/** Plain <a> tags, not onClick handlers — this has to be a full-page navigation so the browser actually leaves the SPA for the provider's consent screen. */
export function OAuthButtons() {
  return (
    <div className="space-y-2">
      <div className="relative flex items-center py-1">
        <div className="flex-1 border-t border-ink-100" />
        <span className="px-3 text-xs font-semibold uppercase text-ink-400">Hoặc</span>
        <div className="flex-1 border-t border-ink-100" />
      </div>
      <a href={`${baseURL}/user/auth/google`} className="btn-secondary flex w-full items-center justify-center gap-2 py-2.5">
        <svg viewBox="0 0 24 24" className="h-4 w-4">
          <path
            fill="#4285F4"
            d="M23.52 12.27c0-.85-.08-1.66-.22-2.44H12v4.62h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.87c2.27-2.09 3.58-5.17 3.58-8.81Z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.96-1.07 7.94-2.92l-3.87-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11A12 12 0 0 0 12 24Z"
          />
          <path fill="#FBBC05" d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54v-3.1H1.27a12 12 0 0 0 0 10.75l4-3.11Z" />
          <path
            fill="#EA4335"
            d="M12 4.75c1.76 0 3.34.6 4.59 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.63l4 3.11C6.22 6.87 8.87 4.75 12 4.75Z"
          />
        </svg>
        Đăng nhập với Google
      </a>
      <a href={`${baseURL}/user/auth/facebook`} className="btn-secondary flex w-full items-center justify-center gap-2 py-2.5">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="#1877F2">
          <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.09 24 18.1 24 12.07Z" />
        </svg>
        Đăng nhập với Facebook
      </a>
    </div>
  );
}
