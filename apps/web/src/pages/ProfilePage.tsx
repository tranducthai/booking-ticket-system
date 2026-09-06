import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { authApi } from "../api/auth";
import { PageSpinner } from "../components/ui/Spinner";

export function ProfilePage() {
  const qc = useQueryClient();
  const { data: me, isLoading } = useQuery({ queryKey: ["me"], queryFn: authApi.me });
  const [form, setForm] = useState({ fullName: "", phone: "", avatarUrl: "" });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (me) setForm({ fullName: me.fullName, phone: me.phone ?? "", avatarUrl: me.avatarUrl ?? "" });
  }, [me]);

  const mutation = useMutation({
    mutationFn: () =>
      authApi.updateMe({ fullName: form.fullName, phone: form.phone || undefined, avatarUrl: form.avatarUrl || undefined }),
    onSuccess: (updated) => {
      qc.setQueryData(["me"], updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  if (isLoading || !me) return <PageSpinner />;

  return (
    <div className="container-page max-w-xl py-10">
      <h1 className="text-2xl">Hồ sơ của tôi</h1>

      <div className="card mt-6 p-6">
        <div className="mb-5 flex items-center gap-3 border-b border-ink-100 pb-5">
          {me.avatarUrl ? (
            <img src={me.avatarUrl} alt={me.fullName} className="h-12 w-12 rounded-full object-cover" />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink-800 text-lg font-bold text-white">
              {me.fullName[0]?.toUpperCase()}
            </span>
          )}
          <div>
            <p className="font-bold text-ink-900">{me.email}</p>
            <p className="text-sm text-ink-500">
              {me.role === "ADMIN" ? "Quản trị viên" : me.role === "ORGANIZER" ? "Ban tổ chức" : "Khách hàng"}
            </p>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <label className="label">Họ và tên</label>
            <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Số điện thoại</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Ảnh đại diện (URL)</label>
            <input
              value={form.avatarUrl}
              onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })}
              placeholder="https://..."
              className="input"
            />
            {me.role === "ORGANIZER" && (
              <p className="mt-1 text-xs text-ink-400">Ảnh này hiển thị ở mục "Nhà tổ chức nổi bật" trên trang chủ (nếu tài khoản đã được xác minh).</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={mutation.isPending} className="btn-primary">
              {mutation.isPending ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
            {saved && <span className="text-sm text-emerald-600">Đã lưu ✓</span>}
          </div>
        </form>
      </div>
    </div>
  );
}
