import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { authApi } from "../api/auth";
import { apiErrorMessage, saveAuth } from "../api/client";
import { PageSpinner } from "../components/ui/Spinner";
import { roleHomePath } from "../lib/roleHome";

/**
 * Landing page for GOOGLE_REDIRECT_URI/FACEBOOK_REDIRECT_URI's final hop —
 * user-service's OAuthController redirects here with ?code=<one-time code>
 * (never the tokens themselves). The code is single-use and valid for 60
 * seconds; POST /user/auth/oauth/exchange trades it for the same
 * AuthResponse every other login path produces.
 */
export function OAuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // StrictMode double-invokes effects in dev — the code is single-use, redeem it once
    ran.current = true;

    const code = params.get("code");
    // Out of the address bar (and history) right away.
    window.history.replaceState(null, "", "/oauth/callback");
    if (!code) {
      setError("Thiếu thông tin đăng nhập từ nhà cung cấp.");
      return;
    }

    authApi
      .oauthExchange(code)
      .then((res) => {
        saveAuth(res);
        navigate(roleHomePath(res.user.role), { replace: true });
      })
      .catch((err) => setError(apiErrorMessage(err, "Không thể hoàn tất đăng nhập — vui lòng thử lại.")));
  }, [params, navigate]);

  if (error) {
    return (
      <div className="container-page flex min-h-[60vh] flex-col items-center justify-center text-center">
        <p className="text-sm text-red-600">{error}</p>
        <a href="/login" className="btn-primary mt-4">
          Về trang đăng nhập
        </a>
      </div>
    );
  }

  return <PageSpinner />;
}
