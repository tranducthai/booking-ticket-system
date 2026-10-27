import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { artistsApi } from "../../api/artists";
import { apiErrorMessage } from "../../api/client";
import type { MyArtist } from "../../api/types";
import { ArtistProfileEditor } from "../../components/admin/ArtistProfileEditor";
import { ArtistFields, artistFormError, artistPayload, EMPTY_ARTIST, type ArtistFormValue } from "../../components/artists/ArtistForm";
import { ArtistStatusFilter, type ArtistStatusFilterValue } from "../../components/artists/ArtistStatusFilter";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageSpinner } from "../../components/ui/Spinner";
import { check } from "../../lib/validation";

/**
 * "Quản lý nghệ sĩ": the artists an organizer created or uses in their
 * events. They can add new ones (full profile) and edit the ones they created
 * until an admin verifies them; verified artists are shared records, so
 * changes go through an admin.
 */
export function OrganizerArtistsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["artists", "mine"], queryFn: artistsApi.mine });
  const [creating, setCreating] = useState<ArtistFormValue | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ArtistStatusFilterValue>("ALL");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => {
      check(artistFormError(creating!));
      return artistsApi.create(artistPayload(creating!));
    },
    onSuccess: () => {
      setCreating(null);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["artists"] });
    },
    onError: (err) => setError(apiErrorMessage(err, "Không thể tạo nghệ sĩ.")),
  });

  const term = q.trim().toLowerCase();
  const list = (data ?? []).filter((a) => (status === "ALL" || a.status === status) && (!term || a.name.toLowerCase().includes(term)));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl">Nghệ sĩ</h1>
        {!creating && (
          <button onClick={() => setCreating({ ...EMPTY_ARTIST })} className="btn-primary">
            + Tạo nghệ sĩ mới
          </button>
        )}
      </div>

      {creating && (
        <div className="card p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="font-bold text-ink-800">Tạo nghệ sĩ mới</p>
            <button onClick={() => setCreating(null)} className="text-sm text-ink-500 hover:text-ink-800">
              Huỷ
            </button>
          </div>
          <ArtistFields value={creating} onChange={setCreating} />
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <p className="mt-4 text-xs text-ink-500">Yêu cầu được gửi tới quản trị viên. Sau khi được duyệt, nghệ sĩ hiện công khai và bạn thêm được vào sự kiện của mình.</p>
          <button onClick={() => create.mutate()} disabled={create.isPending} className="btn-primary mt-4">
            {create.isPending ? "Đang gửi..." : "Gửi yêu cầu tạo nghệ sĩ"}
          </button>
        </div>
      )}

      {(data?.length ?? 0) > 0 && <ArtistStatusFilter value={status} onChange={setStatus} />}

      {(data?.length ?? 0) > 4 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm nghệ sĩ" className="input max-w-xs" />}

      {isLoading ? (
        <PageSpinner />
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState title="Chưa có nghệ sĩ nào" description="Tạo nghệ sĩ để thêm vào lineup sự kiện của bạn." />
      ) : (
        <div className="space-y-3">
          {list.map((a) => (
            <ArtistRow key={a.id} artist={a} editing={editing === a.id} onToggle={() => setEditing(editing === a.id ? null : a.id)} />
          ))}
          {list.length === 0 && <p className="py-8 text-center text-sm text-ink-400">Không có nghệ sĩ nào.</p>}
        </div>
      )}
    </div>
  );
}

function ArtistRow({ artist: a, editing, onToggle }: { artist: MyArtist; editing: boolean; onToggle: () => void }) {
  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center gap-4">
        {a.avatarUrl ? (
          <img src={a.avatarUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-ink-800 text-xl font-bold text-white">{a.name[0]?.toUpperCase()}</span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-bold text-ink-900">{a.name}</span>
            {a.status === "REJECTED" ? <Badge tone="danger">Bị từ chối</Badge> : a.status === "PENDING" ? <Badge tone="warning">Chờ duyệt</Badge> : <Badge tone="success">Đã duyệt</Badge>}
          </div>
          <p className="mt-0.5 text-sm text-ink-500">
            {a.eventCount > 0 ? `${a.eventCount} sự kiện của bạn` : "Chưa thêm vào sự kiện nào"} · {a.followerCount} người theo dõi
          </p>
          {a.status === "REJECTED" && (
            <p className="mt-1 text-sm text-red-600">
              Lý do từ chối: {a.rejectedReason}. Sửa lại hồ sơ để gửi lại.
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm font-semibold">
          {a.canEdit ? (
            <button onClick={onToggle} className="text-brand-600 hover:underline">
              {editing ? "Đóng" : a.status === "REJECTED" ? "Sửa & gửi lại" : "Sửa"}
            </button>
          ) : (
            <a href={`/nghe-si/${a.id}`} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
              Xem trang nghệ sĩ
            </a>
          )}
        </div>
      </div>
      {editing && a.canEdit && (
        <div className="mt-4">
          <ArtistProfileEditor artistId={a.id} />
        </div>
      )}
    </div>
  );
}
