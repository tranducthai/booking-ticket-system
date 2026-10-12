import { useState, type FormEvent } from "react";
import { ACTIVITY_SOURCE_LABEL, ACTIVITY_SOURCES, type ActivityFilters, type ActivitySource } from "../../api/activity";
import { ActivityFeed } from "../../components/activity/ActivityFeed";

const PRESETS: Array<{ label: string; action: string; sources?: ActivitySource[] }> = [
  { label: "Đăng nhập thất bại", action: "auth.login_failed", sources: ["user"] },
  { label: "Check-in bị từ chối", action: "ticket.checkin_rejected", sources: ["ticket"] },
  { label: "Hoàn tiền", action: "refund", sources: ["payment"] },
  { label: "Quản trị người dùng", action: "user.", sources: ["user"] },
  { label: "Hủy / dời sự kiện", action: "event.c", sources: ["event"] },
];

const EMPTY: ActivityFilters & { sources: ActivitySource[] } = { sources: ACTIVITY_SOURCES };

/**
 * System-wide audit log (docs/spec/14-activity-log-design.md §1): every
 * service's append-only ActivityLog, merged, with filters and the
 * technical fields (action codes, IDs, IP, user agent).
 */
export function AdminAuditLogPage() {
  const [draft, setDraft] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);

  const apply = (e?: FormEvent) => {
    e?.preventDefault();
    setApplied(draft);
  };
  const { sources, ...filters } = applied;
  const cleanFilters = Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) as ActivityFilters;
  const field = (key: keyof ActivityFilters, label: string, placeholder = "") => (
    <div>
      <label className="label">{label}</label>
      <input
        value={draft[key] ?? ""}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value.trim() || undefined })}
        placeholder={placeholder}
        className="input font-mono text-xs"
      />
    </div>
  );

  return (
    <div>
      <h2 className="text-lg font-bold text-ink-800">Nhật ký hệ thống (audit log)</h2>
      <p className="mt-1 text-sm text-ink-500">Nhật ký chỉ ghi thêm, không sửa/xóa được. Mỗi service lưu riêng; trang này gộp theo thời gian.</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => {
              const next = { ...EMPTY, action: p.action, sources: p.sources ?? ACTIVITY_SOURCES };
              setDraft(next);
              setApplied(next);
            }}
            className="rounded-full bg-ink-100 px-3 py-1 text-xs font-semibold text-ink-600 hover:bg-ink-200"
          >
            {p.label}
          </button>
        ))}
      </div>

      <form onSubmit={apply} className="card mt-3 grid gap-3 p-4 sm:grid-cols-3">
        {field("action", "Action (tiền tố)", "refund. / auth.login_failed")}
        {field("actorId", "Người thực hiện (userId)")}
        {field("subjectUserId", "Khách hàng liên quan (userId)")}
        {field("eventId", "Sự kiện (eventId)")}
        {field("targetId", "Đối tượng (targetId)")}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Từ</label>
            <input
              type="date"
              value={draft.from?.slice(0, 10) ?? ""}
              onChange={(e) => setDraft({ ...draft, from: e.target.value ? new Date(`${e.target.value}T00:00:00`).toISOString() : undefined })}
              className="input"
            />
          </div>
          <div>
            <label className="label">Đến</label>
            <input
              type="date"
              value={draft.to ? new Date(draft.to).toLocaleDateString("en-CA") : ""}
              onChange={(e) => setDraft({ ...draft, to: e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : undefined })}
              className="input"
            />
          </div>
        </div>
        <div className="sm:col-span-3">
          <label className="label">Nguồn</label>
          <div className="flex flex-wrap gap-3">
            {ACTIVITY_SOURCES.map((s) => (
              <label key={s} className="flex items-center gap-1 text-sm text-ink-600">
                <input
                  type="checkbox"
                  checked={draft.sources.includes(s)}
                  onChange={(e) => setDraft({ ...draft, sources: e.target.checked ? [...draft.sources, s] : draft.sources.filter((x) => x !== s) })}
                />
                {ACTIVITY_SOURCE_LABEL[s]}
              </label>
            ))}
          </div>
        </div>
        <div className="flex gap-2 sm:col-span-3">
          <button type="submit" disabled={draft.sources.length === 0} className="btn-primary">
            Lọc
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(EMPTY);
              setApplied(EMPTY);
            }}
            className="btn-ghost"
          >
            Xóa bộ lọc
          </button>
        </div>
      </form>

      <div className="mt-4">
        <ActivityFeed scope={{ kind: "admin", filters: cleanFilters }} sources={sources} showTechnical />
      </div>
    </div>
  );
}
