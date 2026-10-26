import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { authApi } from "../api/auth";
import { apiErrorMessage } from "../api/client";
import type { Gender } from "../api/types";
import { AccountLayout } from "../components/account/AccountLayout";
import { useImageUpload } from "../components/ui/ImageField";
import { PageSpinner } from "../components/ui/Spinner";
import { check, digitsOnly, rules } from "../lib/validation";

const GENDERS: Array<{ value: Gender; label: string }> = [
  { value: "MALE", label: "Nam" },
  { value: "FEMALE", label: "Nữ" },
  { value: "OTHER", label: "Khác" },
];

/** Stored "0912345678" / "+84912345678" -> the digits after the +84 box. */
const localDigits = (phone: string | null) => (phone ?? "").replace(/^\+84/, "").replace(/^0/, "");
const today = () => new Date().toISOString().slice(0, 10);

/** Ticketbox-style "Thông tin tài khoản": avatar with a camera button, name, phone (+84), verified email, birth date, gender. */
/** The profile form inside the customer's account layout, or on its own inside the organizer channel (`embedded`). */
function ProfileShell({ embedded, children }: { embedded: boolean; children: React.ReactNode }) {
  if (embedded) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl">Hồ sơ</h1>
        <div className="card p-6 sm:p-8">{children}</div>
      </div>
    );
  }
  return (
    <AccountLayout title="Thông tin tài khoản" crumbs={[{ label: "Cài đặt tài khoản" }, { label: "Thông tin tài khoản" }]}>
      {children}
    </AccountLayout>
  );
}

export function ProfilePage({ embedded = false }: { embedded?: boolean } = {}) {
  const qc = useQueryClient();
  const { data: me, isLoading } = useQuery({ queryKey: ["me"], queryFn: authApi.me });
  const [form, setForm] = useState({ fullName: "", phone: "", dateOfBirth: "", gender: "" as Gender | "" });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (me) {
      setForm({ fullName: me.fullName, phone: localDigits(me.phone), dateOfBirth: me.dateOfBirth?.slice(0, 10) ?? "", gender: me.gender ?? "" });
    }
  }, [me]);

  const save = useMutation({
    mutationFn: () => {
      const phone = form.phone ? `0${form.phone}` : "";
      check(
        rules.personName(form.fullName),
        rules.phone(phone),
        form.dateOfBirth && (form.dateOfBirth > today() || form.dateOfBirth < "1900-01-01") ? "Ngày sinh không hợp lệ" : null,
      );
      return authApi.updateMe({
        fullName: form.fullName.trim().replace(/\s+/g, " "),
        phone: phone || undefined,
        dateOfBirth: form.dateOfBirth || null,
        gender: form.gender || null,
      });
    },
    onSuccess: (updated) => {
      setError(null);
      qc.setQueryData(["me"], updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err) => setError(apiErrorMessage(err, "Không thể lưu thay đổi.")),
  });

  const avatar = useMutation({
    mutationFn: (avatarUrl: string) => authApi.updateMe({ avatarUrl }),
    onSuccess: (updated) => qc.setQueryData(["me"], updated),
    onError: (err) => setError(apiErrorMessage(err, "Không thể cập nhật ảnh đại diện.")),
  });

  if (isLoading || !me) return <PageSpinner />;

  return (
    <ProfileShell embedded={embedded}>
      <div className="mx-auto max-w-sm">
        <AvatarPicker name={me.fullName} url={me.avatarUrl} onUploaded={(url) => avatar.mutate(url)} saving={avatar.isPending} />
        <p className="mt-5 text-center text-sm text-ink-600">
          Cung cấp thông tin chính xác sẽ hỗ trợ bạn trong quá trình mua vé, hoặc khi cần xác thực vé
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
          className="mt-6 space-y-5"
        >
          <div>
            <label className="label">Họ và tên</label>
            <input maxLength={100} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="input" />
          </div>

          <div>
            <label className="label">Số điện thoại</label>
            <div className="flex gap-2">
              <span className="input flex w-20 shrink-0 items-center justify-center bg-ink-50 text-ink-600">+84</span>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="Nhập ở đây"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: digitsOnly(e.target.value).replace(/^0/, "") })}
                className="input"
              />
            </div>
          </div>

          <div>
            <label className="label">Email</label>
            <div className="relative">
              <input value={me.email} disabled className="input bg-ink-50 pr-10 text-ink-500" />
              {me.emailVerifiedAt && (
                <span title="Email đã xác thực" className="absolute right-3 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-emerald-500">
                  <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3">
                    <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="label">Ngày tháng năm sinh</label>
            <input type="date" min="1900-01-01" max={today()} value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} className="input" />
          </div>

          <div>
            <label className="label">Giới tính</label>
            <div className="flex gap-6">
              {GENDERS.map((g) => (
                <label key={g.value} className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
                  <input
                    type="radio"
                    name="gender"
                    checked={form.gender === g.value}
                    onChange={() => setForm({ ...form, gender: g.value })}
                    className="h-4 w-4 accent-brand-500"
                  />
                  {g.label}
                </label>
              ))}
            </div>
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={save.isPending} className="btn-primary w-full py-3">
            {save.isPending ? "Đang lưu..." : saved ? "Đã lưu ✓" : "Hoàn thành"}
          </button>
        </form>
      </div>
    </ProfileShell>
  );
}

function AvatarPicker({ name, url, onUploaded, saving }: { name: string; url: string | null; onUploaded: (url: string) => void; saving: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const { enabled, busy, error, upload } = useImageUpload("avatar", onUploaded);

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        {url ? (
          <img src={url} alt={name} className="h-28 w-28 rounded-full object-cover" />
        ) : (
          <span className="flex h-28 w-28 items-center justify-center rounded-full bg-brand-100 text-5xl font-bold text-brand-700">
            {name.trim().charAt(0).toUpperCase()}
          </span>
        )}
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={!enabled || busy || saving}
          title={enabled ? "Đổi ảnh đại diện" : "Máy chủ chưa cấu hình nơi lưu ảnh"}
          className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-brand-500 text-white shadow hover:bg-brand-600 disabled:opacity-50"
        >
          {busy || saving ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" className="h-4.5 w-4.5">
              <path d="M4 8h3l2-3h6l2 3h3v11H4V8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <circle cx="12" cy="13" r="3.5" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          )}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
