import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiErrorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { AuthCard } from "../components/auth/AuthCard";
import { OAuthButtons } from "../components/auth/OAuthButtons";
import { PasswordInput } from "../components/auth/PasswordInput";
import { check, digitsOnly, normalizePhone, rules } from "../lib/validation";

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  // /dang-ky?loai=ban-to-chuc opens straight on the organizer option (e.g. from a "Tạo sự kiện" link).
  const [accountType, setAccountType] = useState<"CUSTOMER" | "ORGANIZER">(search.get("loai") === "ban-to-chuc" ? "ORGANIZER" : "CUSTOMER");
  const organizer = accountType === "ORGANIZER";
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", password: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      check(
        rules.personName(form.fullName),
        rules.email(form.email),
        rules.phone(form.phone, organizer),
        rules.password(form.password),
        rules.confirm(form.confirm, form.password),
      );
      await register({
        fullName: form.fullName.trim().replace(/\s+/g, " "),
        email: form.email.trim(),
        password: form.password,
        phone: normalizePhone(form.phone) || undefined,
        accountType,
      });
      navigate(organizer ? "/kenh-to-chuc" : "/", { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err, "Không thể đăng ký — vui lòng kiểm tra lại thông tin."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Tạo tài khoản"
      subtitle={organizer ? "Đăng ký để tạo và bán vé sự kiện của bạn trên EventPass." : "Đăng ký để giữ chỗ, thanh toán, và lưu vé điện tử của bạn."}
    >
      <div className="mb-5 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Loại tài khoản">
        {(
          [
            ["CUSTOMER", "Người mua vé", "Mua vé, lưu vé điện tử"],
            ["ORGANIZER", "Ban tổ chức", "Tạo & bán vé sự kiện"],
          ] as const
        ).map(([value, label, hint]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={accountType === value}
            onClick={() => setAccountType(value)}
            className={`rounded-xl border-2 px-3 py-3 text-left transition-colors ${
              accountType === value ? "border-brand-500 bg-brand-50" : "border-ink-100 hover:border-ink-200"
            }`}
          >
            <span className={`block text-sm font-bold ${accountType === value ? "text-brand-700" : "text-ink-800"}`}>{label}</span>
            <span className="mt-0.5 block text-xs text-ink-500">{hint}</span>
          </button>
        ))}
      </div>
      {organizer && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Bạn có thể tạo sự kiện ngay sau khi đăng ký. Mỗi sự kiện được quản trị viên duyệt trước khi mở bán; tài khoản sẽ được xác minh sau khi EventPass
          liên hệ qua số điện thoại bạn cung cấp.
        </p>
      )}
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label">{organizer ? "Tên ban tổ chức / người đại diện" : "Họ và tên"}</label>
          <input required maxLength={100} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="input" />
        </div>
        <div>
          <label className="label">Email</label>
          <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" />
        </div>
        <div>
          <label className="label">{organizer ? "Số điện thoại liên hệ" : "Số điện thoại (không bắt buộc)"}</label>
          <input
            type="tel"
            inputMode="tel"
            maxLength={12}
            required={organizer}
            placeholder="VD: 0912345678"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: digitsOnly(e.target.value, true) })}
            className="input"
          />
        </div>
        <div>
          <label className="label">Mật khẩu</label>
          <PasswordInput required minLength={12} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <p className="mt-1 text-xs text-ink-400">Ít nhất 12 ký tự, có chữ hoa và số.</p>
        </div>
        <div>
          <label className="label">Nhập lại mật khẩu</label>
          <PasswordInput required autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
          {form.confirm && form.confirm !== form.password && <p className="mt-1 text-xs text-red-600">Mật khẩu nhập lại không khớp</p>}
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full rounded-xl py-3 text-base">
          {loading ? "Đang tạo tài khoản..." : organizer ? "Đăng ký ban tổ chức" : "Đăng ký"}
        </button>
      </form>
      <div className="mt-4">
        <OAuthButtons />
      </div>
      <p className="mt-6 text-center text-sm text-ink-500">
        Đã có tài khoản?{" "}
        <Link to="/dang-nhap" className="font-semibold text-brand-600 hover:underline">
          Đăng nhập
        </Link>
      </p>
    </AuthCard>
  );
}
