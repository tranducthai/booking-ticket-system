import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { partnerInviteApi } from "../api/admin";
import { apiErrorMessage } from "../api/client";
import { AuthCard } from "../components/auth/AuthCard";
import { PasswordInput } from "../components/auth/PasswordInput";
import { PageSpinner } from "../components/ui/Spinner";
import { rules } from "../lib/validation";

/** Landing page of the partner invitation email: the invitee sets a password, and only then does their organizer account exist. */
export function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";
  const validShape = /^[0-9a-f]{64}$/i.test(token);
  const invite = useQuery({ queryKey: ["partner-invite", token], queryFn: () => partnerInviteApi.preview(token), enabled: validShape, retry: false });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const invalid = rules.password(password) ?? rules.confirm(confirm, password);
    if (invalid) return setError(invalid);
    setLoading(true);
    try {
      await partnerInviteApi.accept(token, password);
      setDone(true);
      setTimeout(() => navigate("/login", { replace: true }), 2500);
    } catch (err) {
      setError(apiErrorMessage(err, "Lời mời không hợp lệ hoặc đã hết hạn."));
    } finally {
      setLoading(false);
    }
  }

  if (validShape && invite.isLoading) return <PageSpinner />;

  if (!validShape || invite.isError) {
    return (
      <AuthCard title="Lời mời không hợp lệ" subtitle="Liên kết bị thiếu, đã được dùng hoặc đã hết hạn. Hãy nhờ quản trị viên gửi lại lời mời.">
        <Link to="/" className="btn-primary w-full py-3 text-base">
          Về trang chủ
        </Link>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard title="Đã kích hoạt tài khoản ✓" subtitle="Tài khoản ban tổ chức của bạn đã sẵn sàng. Hãy đăng nhập bằng email và mật khẩu vừa đặt.">
        <Link to="/login" replace className="btn-primary w-full py-3 text-base">
          Đăng nhập ngay
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Kích hoạt tài khoản đối tác" subtitle={`Xin chào ${invite.data?.fullName}! Đặt mật khẩu để hoàn tất tài khoản ban tổ chức.`}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label">Email đăng nhập</label>
          <input value={invite.data?.email ?? ""} readOnly className="input bg-ink-50" />
        </div>
        <div>
          <label className="label">Mật khẩu</label>
          <PasswordInput required minLength={12} autoFocus autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Ít nhất 12 ký tự, có chữ hoa và số" />
        </div>
        <div>
          <label className="label">Nhập lại mật khẩu</label>
          <PasswordInput required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base">
          {loading ? "Đang lưu..." : "Kích hoạt tài khoản"}
        </button>
      </form>
    </AuthCard>
  );
}
