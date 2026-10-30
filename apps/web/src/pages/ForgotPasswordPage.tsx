import { useState, type FormEvent } from "react";
import { rules } from "../lib/validation";
import { Link } from "react-router-dom";
import { authApi } from "../api/auth";
import { apiErrorMessage } from "../api/client";
import { AuthCard } from "../components/auth/AuthCard";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const invalid = rules.email(email);
    if (invalid) return setError(invalid);
    setLoading(true);
    try {
      await authApi.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <AuthCard title="Kiểm tra email của bạn" subtitle="Liên kết đặt lại mật khẩu đang trên đường tới hộp thư.">
        <div className="space-y-3 text-sm text-ink-600">
          <p>
            Nếu <strong className="text-ink-900">{email}</strong> đã đăng ký tài khoản, bạn sẽ nhận được email kèm liên kết đặt lại mật khẩu trong vài phút.
            Liên kết có hiệu lực <strong>30 phút</strong> và chỉ dùng được một lần.
          </p>
          <p className="text-ink-400">Không thấy email? Hãy kiểm tra thư mục Spam/Quảng cáo, hoặc thử lại sau 1 phút.</p>
        </div>
        <div className="mt-6 flex items-center justify-between text-sm">
          <button type="button" onClick={() => setSent(false)} className="font-semibold text-brand-600 hover:underline">
            Gửi lại
          </button>
          <Link to="/login" className="font-semibold text-ink-600 hover:underline">
            ← Quay lại đăng nhập
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Quên mật khẩu" subtitle="Nhập email đăng ký — chúng tôi sẽ gửi liên kết để bạn tạo mật khẩu mới.">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label">Email</label>
          <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base">
          {loading ? "Đang gửi..." : "Gửi liên kết đặt lại"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-500">
        Nhớ ra mật khẩu rồi?{" "}
        <Link to="/login" className="font-semibold text-brand-600 hover:underline">
          Đăng nhập
        </Link>
      </p>
    </AuthCard>
  );
}
