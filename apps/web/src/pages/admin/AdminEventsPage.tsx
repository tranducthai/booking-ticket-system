import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchOrganizers } from "../../api/admin";
import { apiErrorMessage } from "../../api/client";
import { EVENT_STATUS_LABEL, EVENT_STATUS_TONE, eventsApi } from "../../api/events";
import type { EventStatus } from "../../api/types";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageSpinner } from "../../components/ui/Spinner";
import { formatDateTime } from "../../lib/format";

const TABS: { value: EventStatus | ""; label: string }[] = [
  { value: "", label: "Tất cả" },
  { value: "PUBLISHED", label: "Đang bán" },
  { value: "PENDING_APPROVAL", label: "Chờ duyệt" },
  { value: "DRAFT", label: "Nháp" },
  { value: "REJECTED", label: "Bị từ chối" },
  { value: "CANCELED", label: "Đã hủy" },
];
const PAGE_SIZE = 20;

export function AdminEventsPage() {
  const [search, setSearch] = useSearchParams();
  const status = (search.get("trang-thai") ?? "") as EventStatus | "";
  const organizerId = search.get("doi-tac") ?? "";
  const page = Number(search.get("trang") ?? 1);
  const [q, setQ] = useState(search.get("q") ?? "");

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(search);
    for (const [k, v] of Object.entries(changes)) (v ? next.set(k, v) : next.delete(k));
    if (!("trang" in changes)) next.delete("trang");
    setSearch(next, { replace: true });
  };

  // "Duyệt thẳng": publish a draft / pending / rejected event without waiting for the organizer to (re)submit it.
  const qc = useQueryClient();
  const [approveError, setApproveError] = useState<string | null>(null);
  const approve = useMutation({
    mutationFn: (id: string) => eventsApi.approve(id),
    onSuccess: () => {
      setApproveError(null);
      void qc.invalidateQueries({ queryKey: ["admin"] });
      void qc.invalidateQueries({ queryKey: ["event"] });
    },
    onError: (err) => setApproveError(apiErrorMessage(err, "Không thể duyệt sự kiện.")),
  });

  const { data: organizers } = useQuery({ queryKey: ["admin", "organizers"], queryFn: fetchOrganizers });
  const organizerName = (id: string) => organizers?.find((o) => o.id === id)?.fullName ?? "—";

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "events", status, organizerId, search.get("q") ?? "", page],
    queryFn: () =>
      eventsApi.adminList({
        status: status || undefined,
        organizerId: organizerId || undefined,
        q: search.get("q") || undefined,
        page,
        limit: PAGE_SIZE,
      }),
  });
  // Per-status counts for the tabs (one cheap count query each, cached).
  const { data: counts } = useQuery({
    queryKey: ["admin", "events", "counts", organizerId],
    queryFn: async () => {
      const entries = await Promise.all(
        TABS.map(async (t) => [t.value, (await eventsApi.adminList({ status: t.value || undefined, organizerId: organizerId || undefined, limit: 1 })).total] as const),
      );
      return Object.fromEntries(entries) as Record<string, number>;
    },
  });

  const rows = data?.data ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl">Tất cả sự kiện</h1>
          <p className="mt-1 text-sm text-ink-500">Theo dõi, chỉnh sửa và xử lý mọi sự kiện trên hệ thống.</p>
        </div>
        <Link to={`/quan-tri/su-kien/moi${organizerId ? `?doi-tac=${organizerId}` : ""}`} className="btn-primary">
          + Tạo sự kiện
        </Link>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-ink-100">
        {TABS.map((t) => (
          <button
            key={t.label}
            onClick={() => update({ "trang-thai": t.value })}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-semibold ${
              status === t.value ? "border-brand-500 text-brand-600" : "border-transparent text-ink-500 hover:text-ink-800"
            }`}
          >
            {t.label}
            {counts && <span className="ml-1.5 text-xs text-ink-400">{counts[t.value] ?? 0}</span>}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            update({ q: q.trim() });
          }}
          className="flex min-w-[16rem] flex-1 gap-2"
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên sự kiện, địa điểm..." className="input" />
          <button type="submit" className="btn-secondary shrink-0">
            Tìm
          </button>
        </form>
        <select value={organizerId} onChange={(e) => update({ "doi-tac": e.target.value })} className="input w-64">
          <option value="">Tất cả ban tổ chức</option>
          {organizers?.map((o) => (
            <option key={o.id} value={o.id}>
              {o.fullName}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : rows.length === 0 ? (
        <EmptyState title="Không có sự kiện nào phù hợp" />
      ) : (
        <div className="card overflow-x-auto">
          {approveError && <p className="m-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{approveError}</p>}
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-left text-xs uppercase text-ink-400">
              <tr>
                <th className="px-4 py-3">Sự kiện</th>
                <th className="px-4 py-3">Ban tổ chức</th>
                <th className="px-4 py-3">Thời gian</th>
                <th className="px-4 py-3">Đã bán</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const pct = e.ticketsTotal > 0 ? Math.round((e.ticketsSold / e.ticketsTotal) * 100) : 0;
                return (
                  <tr key={e.id} className="border-t border-ink-100 align-top">
                    <td className="px-4 py-3">
                      <Link to={`/quan-tri/su-kien/${e.id}`} className="font-semibold text-ink-900 hover:text-brand-600">
                        {e.title}
                      </Link>
                      <p className="text-xs text-ink-400">
                        {e.category?.name} · {e.venueName}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-ink-600">
                      <button onClick={() => update({ "doi-tac": e.organizerId })} className="hover:text-brand-600 hover:underline">
                        {organizerName(e.organizerId)}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-600">{formatDateTime(e.startTime)}</td>
                    <td className="px-4 py-3">
                      <p className="whitespace-nowrap font-semibold text-ink-800">
                        {e.ticketsSold}/{e.ticketsTotal}
                      </p>
                      <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-ink-100">
                        <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={EVENT_STATUS_TONE[e.status]}>{EVENT_STATUS_LABEL[e.status]}</Badge>
                      {e.cancelRequestedAt && e.status === "PUBLISHED" && (
                        <p className="mt-1 text-xs font-semibold text-amber-600">Đang yêu cầu hủy</p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <Link to={`/quan-tri/su-kien/${e.id}`} className="font-semibold text-brand-600 hover:underline">
                        Quản lý
                      </Link>
                      {["DRAFT", "REJECTED", "PENDING_APPROVAL"].includes(e.status) && (
                        <button
                          onClick={() => confirm(`Duyệt và đăng bán "${e.title}" ngay?`) && approve.mutate(e.id)}
                          disabled={approve.isPending}
                          className="ml-3 font-semibold text-emerald-600 hover:underline"
                        >
                          Duyệt
                        </button>
                      )}
                      {(e.status === "PUBLISHED" || e.status === "CANCELED") && (
                        <a href={`/su-kien/${e.id}`} target="_blank" rel="noreferrer" className="ml-3 text-ink-500 hover:underline">
                          Xem ↗
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <button disabled={page <= 1} onClick={() => update({ trang: String(page - 1) })} className="btn-ghost">
            ← Trước
          </button>
          <span className="text-ink-500">
            Trang {page}/{totalPages}
          </span>
          <button disabled={page >= totalPages} onClick={() => update({ trang: String(page + 1) })} className="btn-ghost">
            Sau →
          </button>
        </div>
      )}
    </div>
  );
}
