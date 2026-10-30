import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { apiErrorMessage, clearAuthFlash, peekAuthFlash } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { AuthCard } from "../components/auth/AuthCard";
import { OAuthButtons } from "../components/auth/OAuthButtons";
import { PasswordInput } from "../components/auth/PasswordInput";
import { roleHomePath } from "../lib/roleHome";
import { rules } from "../lib/validation";

/** `?loi=` codes from user-service's OAuthController (src/auth/oauth/oauth-errors.ts). */
const OAUTH_ERRORS: Record<string, string> = {
  oauth: "Đăng nhập bằng Google/Facebook không thành công — vui lòng thử lại.",
  oauth_chua_cau_hinh: "Đăng nhập bằng Google/Facebook chưa được cấu hình trên hệ thống này.",
  oauth_huy: "Bạn đã huỷ đăng nhập bằng Google/Facebook.",
  oauth_state: "Phiên đăng nhập bằng Google/Facebook đã hết hạn hoặc không hợp lệ — vui lòng thử lại.",
  oauth_email_chua_xac_minh: "Email của tài khoản Google này chưa được xác minh.",
  oauth_email_da_ton_tai: "Email này đã có tài khoản — hãy đăng nhập bằng mật khẩu hoặc Google.",
  oauth_tai_khoan_bi_khoa: "Tài khoản này đã bị khóa.",
};

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: { pathname: string } } };
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(() => {
    const code = searchParams.get("loi");
    return code ? (OAUTH_ERRORS[code] ?? OAUTH_ERRORS.oauth) : peekAuthFlash();
  });
  const [loading, setLoading] = useState(false);

  // Read in the initializer, cleared here — StrictMode runs initializers twice.
  useEffect(() => clearAuthFlash(), []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const invalid = rules.email(email);
    if (invalid) return setError(invalid);
    setLoading(true);
    try {
      const role = await login(email.trim(), password);
      navigate(location.state?.from?.pathname ?? roleHomePath(role), { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err, "Email hoặc mật khẩu không đúng."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Đăng nhập" subtitle="Chào mừng trở lại! Nhập thông tin để tiếp tục.">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label">Email</label>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="label">Mật khẩu</label>
            <Link to="/forgot-password" className="mb-1.5 text-xs font-semibold text-brand-600 hover:underline">
              Quên mật khẩu?
            </Link>
          </div>
          <PasswordInput required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full rounded-xl py-3 text-base">
          {loading ? "Đang đăng nhập..." : "Đăng nhập"}
        </button>
      </form>
      <div className="mt-4">
        <OAuthButtons />
      </div>
      <p className="mt-6 text-center text-sm text-ink-500">
        Chưa có tài khoản?{" "}
        <Link to="/register" className="font-semibold text-brand-600 hover:underline">
          Đăng ký ngay
        </Link>
      </p>
    </AuthCard>
  );
}
