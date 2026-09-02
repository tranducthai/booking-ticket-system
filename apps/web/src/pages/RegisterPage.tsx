import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiErrorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { AuthCard } from "../components/auth/AuthCard";

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register({ ...form, phone: form.phone || undefined });
      navigate("/", { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err, "Không thể đăng ký — vui lòng kiểm tra lại thông tin."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Tạo tài khoản" subtitle="Đăng ký để giữ chỗ, thanh toán, và lưu vé điện tử của bạn.">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label">Họ và tên</label>
          <input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="input" />
        </div>
        <div>
          <label className="label">Email</label>
          <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" />
        </div>
        <div>
          <label className="label">Số điện thoại (không bắt buộc)</label>
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" />
        </div>
        <div>
          <label className="label">Mật khẩu</label>
          <input
            type="password"
            required
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="input"
          />
          <p className="mt-1 text-xs text-ink-400">Tối thiểu 8 ký tự.</p>
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base">
          {loading ? "Đang tạo tài khoản..." : "Đăng ký"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-500">
        Đã có tài khoản?{" "}
        <Link to="/dang-nhap" className="font-semibold text-brand-600 hover:underline">
          Đăng nhập
        </Link>
      </p>
    </AuthCard>
  );
}
