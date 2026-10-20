import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { authApi } from "../api/auth";
import { apiErrorMessage } from "../api/client";
import { AuthCard } from "../components/auth/AuthCard";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Mật khẩu cần ít nhất 8 ký tự.");
    if (password !== confirm) return setError("Mật khẩu nhập lại không khớp.");
    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
      setTimeout(() => navigate("/dang-nhap", { replace: true }), 2500);
    } catch (err) {
      setError(apiErrorMessage(err, "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn."));
    } finally {
      setLoading(false);
    }
  }

  if (!/^[0-9a-f]{64}$/i.test(token)) {
    return (
      <AuthCard title="Liên kết không hợp lệ" subtitle="Liên kết đặt lại mật khẩu bị thiếu hoặc sai.">
        <Link to="/quen-mat-khau" className="btn-primary w-full py-3 text-base">
          Yêu cầu liên kết mới
        </Link>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard title="Đã đổi mật khẩu ✓" subtitle="Hãy đăng nhập bằng mật khẩu mới. Các phiên đăng nhập cũ đã được đăng xuất.">
        <Link to="/dang-nhap" replace className="btn-primary w-full py-3 text-base">
          Đăng nhập ngay
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Đặt lại mật khẩu" subtitle="Tạo mật khẩu mới cho tài khoản của bạn.">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label">Mật khẩu mới</label>
          <input type="password" required minLength={8} autoFocus value={password} onChange={(e) => setPassword(e.target.value)} className="input" placeholder="Ít nhất 8 ký tự" />
        </div>
        <div>
          <label className="label">Nhập lại mật khẩu mới</label>
          <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="input" />
        </div>
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}{" "}
            <Link to="/quen-mat-khau" className="font-semibold underline">
              Gửi lại liên kết
            </Link>
          </p>
        )}
        <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base">
          {loading ? "Đang lưu..." : "Đổi mật khẩu"}
        </button>
      </form>
    </AuthCard>
  );
}
