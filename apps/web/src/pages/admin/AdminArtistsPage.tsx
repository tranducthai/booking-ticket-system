import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { fetchOrganizers } from "../../api/admin";
import { api, apiErrorMessage } from "../../api/client";
import { artistsApi } from "../../api/artists";
import { ArtistFields, artistFormError, artistPayload, EMPTY_ARTIST, type ArtistFormValue } from "../../components/artists/ArtistForm";
import { check } from "../../lib/validation";
import { ArtistStatusFilter, type ArtistStatusFilterValue } from "../../components/artists/ArtistStatusFilter";
import { Badge } from "../../components/ui/Badge";
import { PageSpinner } from "../../components/ui/Spinner";
import { MembershipPlanEditor } from "../../components/admin/MembershipPlanEditor";
import { ArtistProfileEditor } from "../../components/admin/ArtistProfileEditor";
import { PendingArtists } from "../../components/admin/PendingArtists";

export function AdminArtistsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ArtistStatusFilterValue>("ALL");
  const [open, setOpen] = useState<{ id: string; panel: "profile" | "plan" } | null>(null);
  const toggle = (id: string, panel: "profile" | "plan") => setOpen(open?.id === id && open.panel === panel ? null : { id, panel });
  const { data, isLoading } = useQuery({
    queryKey: ["artists", "admin", q, status],
    queryFn: () => artistsApi.search({ q: q || undefined, status: status === "ALL" ? undefined : status, limit: 50 }),
  });

  // An artist an admin creates is approved and verified straight away (ArtistsService.create).
  const [creating, setCreating] = useState<ArtistFormValue | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [organizerId, setOrganizerId] = useState("");
  const { data: organizers } = useQuery({ queryKey: ["admin", "organizers"], queryFn: fetchOrganizers, enabled: !!creating });
  const create = useMutation({
    mutationFn: () => {
      check(organizerId ? artistFormError(creating!) : "Chọn ban tổ chức (đối tác) cho nghệ sĩ.");
      return artistsApi.create({ ...artistPayload(creating!), organizerId });
    },
    onSuccess: () => {
      setCreating(null);
      setOrganizerId("");
      setCreateError(null);
      void qc.invalidateQueries({ queryKey: ["artists"] });
    },
    onError: (err) => setCreateError(apiErrorMessage(err, "Không thể tạo nghệ sĩ.")),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, verify }: { id: string; verify: boolean }) =>
      api.patch(`/event/artists/${id}/${verify ? "verify" : "unverify"}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["artists"] }),
  });

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-bold text-ink-800">Nghệ sĩ</h2>
        <div className="flex items-center gap-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên..." className="input w-64" />
          {!creating && (
            <button onClick={() => setCreating({ ...EMPTY_ARTIST })} className="btn-primary">
              + Tạo nghệ sĩ
            </button>
          )}
        </div>
      </div>

      {creating && (
        <div className="card mb-5 p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="font-bold text-ink-800">Tạo nghệ sĩ mới</p>
            <button onClick={() => setCreating(null)} className="text-sm text-ink-500 hover:text-ink-800">
              Huỷ
            </button>
          </div>
          <div className="mb-4">
            <label className="label">
              <span className="text-brand-600">*</span> Ban tổ chức (đối tác)
            </label>
            <select value={organizerId} onChange={(e) => setOrganizerId(e.target.value)} className="input">
              <option value="">— Chọn đối tác —</option>
              {organizers?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.fullName} ({o.email})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-ink-500">Nghệ sĩ thuộc về đối tác được chọn và xuất hiện trong mục Nghệ sĩ của họ.</p>
          </div>
          <ArtistFields value={creating} onChange={setCreating} />
          {createError && <p className="mt-3 text-sm text-red-600">{createError}</p>}
          <button onClick={() => create.mutate()} disabled={create.isPending} className="btn-primary mt-4">
            {create.isPending ? "Đang tạo..." : "Tạo nghệ sĩ"}
          </button>
        </div>
      )}

      <div className="mb-5">
        <ArtistStatusFilter value={status} onChange={setStatus} />
      </div>

      {/* Pending requests carry the approve/reject actions, so they stand in for the list on the "chờ duyệt" filter. */}
      {(status === "ALL" || status === "PENDING") && <PendingArtists />}

      {status === "PENDING" ? null : isLoading ? (
        <PageSpinner />
      ) : (
        <div className="space-y-2">
          {data?.data.map((a) => (
            <div key={a.id} className="card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {a.avatarUrl ? (
                  <img src={a.avatarUrl} alt={a.name} className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-800 text-sm font-bold text-white">
                    {a.name[0]?.toUpperCase()}
                  </span>
                )}
                <p className="font-semibold text-ink-900">{a.name}</p>
                {a.status === "PENDING" && <Badge tone="warning">Chờ duyệt</Badge>}
                {a.status === "REJECTED" && <Badge tone="danger">Bị từ chối</Badge>}
                {a.isVerified && <Badge tone="success">Đã xác minh</Badge>}
              </div>
              <div className="flex items-center gap-2">
                <a href={`/artists/${a.id}`} target="_blank" rel="noreferrer" className="btn-ghost">
                  Xem trang
                </a>
                <button onClick={() => toggle(a.id, "profile")} className="btn-secondary">
                  Hồ sơ
                </button>
                <button onClick={() => toggle(a.id, "plan")} className="btn-secondary">
                  Thẻ thành viên
                </button>
                <button
                  onClick={() => toggleMutation.mutate({ id: a.id, verify: !a.isVerified })}
                  disabled={toggleMutation.isPending}
                  className={a.isVerified ? "btn-ghost" : "btn-primary"}
                >
                  {a.isVerified ? "Bỏ xác minh" : "Xác minh"}
                </button>
              </div>
            </div>
            {open?.id === a.id && (
              <div className="mt-4">
                {open.panel === "plan" ? <MembershipPlanEditor artistId={a.id} artistName={a.name} /> : <ArtistProfileEditor artistId={a.id} />}
              </div>
            )}
            </div>
          ))}
          {data?.data.length === 0 && <p className="py-8 text-center text-sm text-ink-400">Không có nghệ sĩ nào.</p>}
        </div>
      )}
    </div>
  );
}
