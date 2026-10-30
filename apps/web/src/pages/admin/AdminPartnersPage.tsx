import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { check, digitsOnly, normalizePhone, rules } from "../../lib/validation";
import { Fragment, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { adminApi, fetchOrganizers } from "../../api/admin";
import { apiErrorMessage } from "../../api/client";
import { eventsApi } from "../../api/events";
import { AvatarUpload } from "../../components/ui/AvatarUpload";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageSpinner } from "../../components/ui/Spinner";
import { formatDateTime } from "../../lib/format";

const EMPTY = { fullName: "", email: "", phone: "" };

/**
 * Partners = organizer accounts. The list adds what an admin actually needs
 * to manage them: how many events each runs (and how many are on sale),
 * quick links to create/see their events, and inviting a new partner by email
 * (their account is created when they set a password from the link).
 */
export function AdminPartnersPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);

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
      );
      return adminApi.invitePartner({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: normalizePhone(form.phone) || undefined,
      });
    },
    onSuccess: (res) => {
      setInvitedEmail(res.email);
      setForm(EMPTY);
      setAdding(false);
    },
    onError: (err) => setError(apiErrorMessage(err, "Không thể gửi lời mời.")),
  });
  const [editing, setEditing] = useState<{ id: string; fullName: string; phone: string; avatarUrl: string; description: string } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const editMutation = useMutation({
    mutationFn: () => {
      check(rules.length(editing!.fullName, "Tên đối tác", 2, 120), rules.phone(editing!.phone));
      return adminApi.updatePartner(editing!.id, {
        fullName: editing!.fullName.trim(),
        phone: normalizePhone(editing!.phone) || null,
        ...(editing!.avatarUrl ? { avatarUrl: editing!.avatarUrl } : {}),
        organizerDescription: editing!.description.trim(),
      });
    },
    onSuccess: () => {
      setEditing(null);
      setEditError(null);
      void qc.invalidateQueries({ queryKey: ["admin", "organizers"] });
      void qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (err) => setEditError(apiErrorMessage(err, "Không thể lưu thông tin đối tác.")),
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

      {invitedEmail && (
        <div className="card border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          Đã gửi email mời tới <strong>{invitedEmail}</strong>.
          <button onClick={() => setInvitedEmail(null)} className="ml-3 text-xs font-semibold underline">
            Ẩn đi
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
            <label className="label">Email</label>
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
          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
          <p className="text-xs text-ink-500 sm:col-span-2">Đối tác nhận email, tự đặt mật khẩu rồi tài khoản ban tổ chức mới được tạo.</p>
          <div className="sm:col-span-2">
            <button type="submit" disabled={createMutation.isPending} className="btn-primary">
              {createMutation.isPending ? "Đang gửi..." : "Gửi lời mời"}
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
                  <Fragment key={o.id}>
                  <tr className="border-t border-ink-100">
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
                      <Link to={`/admin/events?partner=${o.id}`} className="font-semibold text-ink-800 hover:text-brand-600">
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
                      <button
                        onClick={() => {
                          setEditError(null);
                          setEditing(editing?.id === o.id ? null : { id: o.id, fullName: o.fullName, phone: o.phone ?? "", avatarUrl: o.avatarUrl ?? "", description: o.organizerDescription ?? "" });
                        }}
                        className="mr-3 font-semibold text-ink-700 hover:underline"
                      >
                        {editing?.id === o.id ? "Đóng" : "Sửa"}
                      </button>
                      <Link to={`/admin/events/new?partner=${o.id}`} className="font-semibold text-brand-600 hover:underline">
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
                  {editing?.id === o.id && (
                    <tr className="bg-ink-50/60">
                      <td colSpan={5} className="px-4 py-4">
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            setEditError(null);
                            editMutation.mutate();
                          }}
                          className="grid gap-4 sm:grid-cols-3"
                        >
                          <div className="sm:col-span-3">
                            <AvatarUpload label="Ảnh đại diện" kind="avatar" shape="square" value={editing.avatarUrl} onChange={(url) => setEditing({ ...editing, avatarUrl: url })} />
                          </div>
                          <div>
                            <label className="label">Tên đơn vị / thương hiệu</label>
                            <input required value={editing.fullName} onChange={(e) => setEditing({ ...editing, fullName: e.target.value })} className="input" />
                          </div>
                          <div>
                            <label className="label">Email (không đổi được)</label>
                            <input value={o.email} readOnly className="input bg-ink-100" />
                          </div>
                          <div>
                            <label className="label">Số điện thoại</label>
                            <input
                              type="tel"
                              inputMode="tel"
                              maxLength={12}
                              value={editing.phone}
                              onChange={(e) => setEditing({ ...editing, phone: digitsOnly(e.target.value, true) })}
                              className="input"
                            />
                          </div>
                          <div className="sm:col-span-3">
                            <label className="label">Thông tin ban tổ chức</label>
                            <textarea
                              value={editing.description}
                              maxLength={5000}
                              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                              className="input min-h-[120px]"
                            />
                            <p className="mt-1 text-right text-xs text-ink-400">{editing.description.length} / 5000</p>
                          </div>
                          {editError && <p className="text-sm text-red-600 sm:col-span-3">{editError}</p>}
                          <div className="flex gap-2 sm:col-span-3">
                            <button type="submit" disabled={editMutation.isPending} className="btn-primary">
                              {editMutation.isPending ? "Đang lưu..." : "Lưu"}
                            </button>
                            <button type="button" onClick={() => setEditing(null)} className="btn-secondary">
                              Huỷ
                            </button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
