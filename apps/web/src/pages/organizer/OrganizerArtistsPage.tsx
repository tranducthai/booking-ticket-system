import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { artistsApi } from "../../api/artists";
import { apiErrorMessage } from "../../api/client";
import type { MyArtist } from "../../api/types";
import { ArtistProfileEditor } from "../../components/admin/ArtistProfileEditor";
import { ArtistFields, artistFormError, artistPayload, EMPTY_ARTIST, type ArtistFormValue } from "../../components/artists/ArtistForm";
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
  const list = (data ?? []).filter((a) => !term || a.name.toLowerCase().includes(term));

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
          <button onClick={() => create.mutate()} disabled={create.isPending} className="btn-primary mt-5">
            {create.isPending ? "Đang tạo..." : "Tạo nghệ sĩ"}
          </button>
        </div>
      )}

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
            <Link to={`/nghe-si/${a.id}`} className="truncate font-bold text-ink-900 hover:text-brand-600">
              {a.name}
            </Link>
            {a.isVerified ? <Badge tone="success">Đã xác minh</Badge> : <Badge tone="warning">Chờ xác minh</Badge>}
          </div>
          <p className="mt-0.5 text-sm text-ink-500">
            {a.eventCount > 0 ? `${a.eventCount} sự kiện của bạn` : "Chưa thêm vào sự kiện nào"} · {a.followerCount} người theo dõi
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm font-semibold">
          <Link to={`/nghe-si/${a.id}`} className="text-ink-500 hover:text-ink-800">
            Xem trang
          </Link>
          {a.canEdit ? (
            <button onClick={onToggle} className="text-brand-600 hover:underline">
              {editing ? "Đóng" : "Sửa"}
            </button>
          ) : (
            <span className="font-normal text-ink-400" title={a.isVerified ? "Nghệ sĩ đã xác minh — liên hệ quản trị viên để chỉnh sửa" : "Nghệ sĩ do người khác tạo"}>
              Không thể sửa
            </span>
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
