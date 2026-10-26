import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { check, digitsOnly, normalizePhone, rules } from "../../lib/validation";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { adminApi, fetchOrganizers } from "../../api/admin";
import { apiErrorMessage } from "../../api/client";
import { eventsApi } from "../../api/events";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageSpinner } from "../../components/ui/Spinner";
import { formatDateTime } from "../../lib/format";

const EMPTY = { fullName: "", email: "", phone: "", password: "" };

/** A readable random initial password the admin hands to the partner. */
function suggestPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let pw = Array.from(crypto.getRandomValues(new Uint32Array(12)), (n) => chars[n % chars.length]).join("");
  // The password rule needs a letter and a digit — a random draw can miss either.
  if (!/\d/.test(pw)) pw = pw.slice(0, -1) + String(2 + (crypto.getRandomValues(new Uint32Array(1))[0] % 8));
  if (!/[A-Za-z]/.test(pw)) pw = "k" + pw.slice(1);
  return pw;
}

/**
 * Partners = organizer accounts. The list adds what an admin actually needs
 * to manage them: how many events each runs (and how many are on sale),
 * quick links to create/see their events, and onboarding a new partner
 * directly instead of "sign up as a customer, then get promoted".
 */
export function AdminPartnersPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  const { data: organizers, isLoading } = useQuery({ queryKey: ["admin", "organizers"], queryFn: fetchOrganizers });
  // Event counts per organizer — one page of up to 100 events is plenty at this scale.
  const { data: events } = useQuery({ queryKey: ["admin", "events", "all-for-partners"], queryFn: () => eventsApi.adminList({ limit: 100 }) });
  const stats = new Map<string, { total: number; live: number }>();
  for (const e of events?.data ?? []) {
    const s = stats.get(e.organizerId) ?? { total: 0, live: 0 };
    s.total++;
    if (e.status === "PUBLISHED") s.live++;
    stats.set(e.organizerId, s);
  }

  const createMutation = useMutation({
    mutationFn: () => {
      check(
        rules.length(form.fullName, "Tên đối tác", 2, 120),
        rules.email(form.email),
        rules.phone(form.phone),
        rules.password(form.password),
      );
      return adminApi.createPartner({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: normalizePhone(form.phone) || undefined,
      });
    },
    onSuccess: (user) => {
      setCreated({ email: user.email, password: form.password });
      setForm(EMPTY);
      setAdding(false);
      void qc.invalidateQueries({ queryKey: ["admin", "organizers"] });
      void qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (err) => setError(apiErrorMessage(err, "Không thể tạo tài khoản đối tác.")),
  });
  const verifyMutation = useMutation({
    mutationFn: (id: string) => adminApi.verifyOrganizer(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "organizers"] }),
  });

  const lockMutation = useMutation({
    mutationFn: ({ id, isLocked }: { id: string; isLocked: boolean }) => adminApi.lockUser(id, isLocked),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "organizers"] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    createMutation.mutate();
  }

  const term = q.trim().toLowerCase();
  const list = (organizers ?? []).filter((o) => !term || o.fullName.toLowerCase().includes(term) || o.email.toLowerCase().includes(term));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl">Đối tác (ban tổ chức)</h1>
          <p className="mt-1 text-sm text-ink-500">Các đơn vị tổ chức sự kiện bán vé trên hệ thống.</p>
        </div>
        <button onClick={() => setAdding((v) => !v)} className="btn-primary">
          {adding ? "Đóng" : "+ Thêm đối tác"}
        </button>
      </div>

      {created && (
        <div className="card border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          Đã tạo tài khoản đối tác. Gửi thông tin đăng nhập này cho đối tác (sẽ không hiển thị lại):
          <p className="mt-2 font-mono">
            {created.email} / {created.password}
          </p>
          <button onClick={() => setCreated(null)} className="mt-2 text-xs font-semibold underline">
            Đã lưu, ẩn đi
          </button>
        </div>
      )}

      {adding && (
        <form onSubmit={onSubmit} className="card grid gap-4 p-6 sm:grid-cols-2">
          <div>
            <label className="label">Tên đơn vị / thương hiệu</label>
            <input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="input" placeholder="VD: VNStage Live" />
          </div>
          <div>
            <label className="label">Email đăng nhập</label>
            <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Số điện thoại (không bắt buộc)</label>
            <input
              type="tel"
              inputMode="tel"
              maxLength={12}
              placeholder="VD: 0912345678"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: digitsOnly(e.target.value, true) })}
              className="input"
            />
          </div>
          <div>
            <label className="label">Mật khẩu ban đầu (8–72 ký tự, gồm chữ và số)</label>
            <div className="flex gap-2">
              <input required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input font-mono" />
              <button type="button" onClick={() => setForm({ ...form, password: suggestPassword() })} className="btn-secondary shrink-0">
                Tạo ngẫu nhiên
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
          <div className="sm:col-span-2">
            <button type="submit" disabled={createMutation.isPending} className="btn-primary">
              {createMutation.isPending ? "Đang tạo..." : "Tạo tài khoản đối tác"}
            </button>
          </div>
        </form>
      )}

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên hoặc email..." className="input max-w-md" />

      {isLoading ? (
        <PageSpinner />
      ) : list.length === 0 ? (
        <EmptyState title="Chưa có đối tác nào" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-left text-xs uppercase text-ink-400">
              <tr>
                <th className="px-4 py-3">Đối tác</th>
                <th className="px-4 py-3">Sự kiện</th>
                <th className="px-4 py-3">Tham gia</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {list.map((o) => {
                const s = stats.get(o.id) ?? { total: 0, live: 0 };
                return (
                  <tr key={o.id} className="border-t border-ink-100">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {o.avatarUrl ? (
                          <img src={o.avatarUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />
                        ) : (
                          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-800 text-sm font-bold text-white">
                            {o.fullName[0]?.toUpperCase()}
                          </span>
                        )}
                        <div>
                          <p className="font-semibold text-ink-900">
                            {o.fullName} {o.isOrganizerVerified && <span className="text-emerald-500">✓</span>}
                          </p>
                          <p className="text-xs text-ink-400">
                            {o.email}
                            {o.phone ? ` · ${o.phone}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/quan-tri/su-kien?doi-tac=${o.id}`} className="font-semibold text-ink-800 hover:text-brand-600">
                        {s.total} sự kiện
                      </Link>
                      <p className="text-xs text-ink-400">{s.live} đang bán</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-500">{formatDateTime(o.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={o.isLocked ? "danger" : "success"}>{o.isLocked ? "Đã khóa" : "Hoạt động"}</Badge>
                      {!o.isOrganizerVerified && (
                        <span className="ml-1">
                          <Badge tone="warning">Chưa xác minh</Badge>
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {!o.isOrganizerVerified && (
                        <button
                          onClick={() => confirm(`Xác minh ban tổ chức ${o.fullName}? (đã kiểm tra thông tin liên hệ: ${o.phone ?? "—"})`) && verifyMutation.mutate(o.id)}
                          disabled={verifyMutation.isPending}
                          className="mr-3 font-semibold text-emerald-600 hover:underline"
                        >
                          Xác minh
                        </button>
                      )}
                      <Link to={`/quan-tri/su-kien/moi?doi-tac=${o.id}`} className="font-semibold text-brand-600 hover:underline">
                        Tạo sự kiện
                      </Link>
                      <button
                        onClick={() => {
                          if (o.isLocked || confirm(`Khóa tài khoản ${o.fullName}? Đối tác sẽ không đăng nhập được.`)) {
                            lockMutation.mutate({ id: o.id, isLocked: !o.isLocked });
                          }
                        }}
                        className="ml-3 text-ink-500 hover:underline"
                      >
                        {o.isLocked ? "Mở khóa" : "Khóa"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
