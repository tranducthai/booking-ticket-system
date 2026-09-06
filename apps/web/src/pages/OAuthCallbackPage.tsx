import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, saveAuth } from "../api/client";
import type { User } from "../api/types";
import { PageSpinner } from "../components/ui/Spinner";

/**
 * Landing page for GOOGLE_REDIRECT_URI/FACEBOOK_REDIRECT_URI's final hop —
 * user-service's OAuthController redirects here with ?accessToken=&refreshToken=
 * once the provider round-trip succeeds. Fetches the profile with those
 * tokens (not yet in storage, so passed explicitly — see the header override
 * below) and only then calls saveAuth, matching the shape every other login
 * path (email/password, register) already produces.
 */
export function OAuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // StrictMode double-invokes effects in dev — this has a real side effect (writes to storage), run it once
    ran.current = true;

    const accessToken = params.get("accessToken");
    const refreshToken = params.get("refreshToken");
    if (!accessToken || !refreshToken) {
      setError("Thiếu thông tin đăng nhập từ nhà cung cấp.");
      return;
    }

    api
      .get<User>("/user/users/me", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((res) => {
        saveAuth({ accessToken, refreshToken, user: res.data });
        navigate("/", { replace: true });
      })
      .catch(() => setError("Không thể hoàn tất đăng nhập — vui lòng thử lại."));
  }, [params, navigate]);

  if (error) {
    return (
      <div className="container-page flex min-h-[60vh] flex-col items-center justify-center text-center">
        <p className="text-sm text-red-600">{error}</p>
        <a href="/dang-nhap" className="btn-primary mt-4">
          Về trang đăng nhập
        </a>
      </div>
    );
  }

  return <PageSpinner />;
}
