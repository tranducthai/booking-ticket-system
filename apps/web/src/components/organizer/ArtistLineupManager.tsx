import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { artistsApi } from "../../api/artists";
import { apiErrorMessage } from "../../api/client";
import type { EventArtist } from "../../api/types";

export interface ArtistChip {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/**
 * "Lineup" (Eventbrite's own term — see Artist's doc comment in
 * schema.prisma) for events in a music/performance category. A modal lists
 * the organizer's own active (approved) artists to pick from — requesting a
 * new artist lives on the organizer's "Nghệ sĩ" page, not here.
 *
 * Two modes: with an `eventId` it attaches to that event right away; without
 * one (the event doesn't exist yet — the wizard's first step) it edits a
 * `draft` list that the wizard attaches once the draft event is created.
 */
export function ArtistLineupManager({
  eventId,
  lineup = [],
  draft,
}: {
  eventId?: string;
  lineup?: EventArtist[];
  draft?: { value: ArtistChip[]; onChange: (value: ArtistChip[]) => void };
}) {
  const qc = useQueryClient();
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const items: ArtistChip[] = eventId ? lineup.map((l) => ({ id: l.artistId, name: l.artist.name, avatarUrl: l.artist.avatarUrl ?? null })) : (draft?.value ?? []);
  const attachedIds = new Set(items.map((a) => a.id));

  const { data: mine, isLoading: loadingMine } = useQuery({ queryKey: ["artists", "mine"], queryFn: artistsApi.mine, enabled: picking });
  const term = query.trim().toLowerCase();
  const active = (mine ?? []).filter((a) => a.status === "APPROVED" && (!term || a.name.toLowerCase().includes(term)));

  const refresh = () => {
    if (eventId) void qc.invalidateQueries({ queryKey: ["event", eventId] });
  };

  async function attach(artist: ArtistChip) {
    if (attachedIds.has(artist.id)) return;
    if (eventId) await artistsApi.lineup.attach(eventId, artist.id);
    else draft?.onChange([...items, artist]);
  }

  const attachMutation = useMutation({
    mutationFn: attach,
    onSuccess: refresh,
    onError: (err) => setError(apiErrorMessage(err, "Không thể thêm nghệ sĩ.")),
  });

  const detachMutation = useMutation({
    mutationFn: async (artistId: string) => {
      if (eventId) await artistsApi.lineup.detach(eventId, artistId);
      else draft?.onChange(items.filter((a) => a.id !== artistId));
    },
    onSuccess: refresh,
    onError: (err) => setError(apiErrorMessage(err, "Không thể xóa nghệ sĩ.")),
  });

  return (
    <div className="card p-6">
      <h3 className="text-base font-bold text-ink-800">Nghệ sĩ tham gia (Lineup)</h3>

      {items.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {items.map((a) => (
            <span key={a.id} className="flex items-center gap-2 rounded-full bg-ink-100 py-1.5 pl-1.5 pr-3 text-sm font-semibold text-ink-700">
              {a.avatarUrl ? (
                <img src={a.avatarUrl} alt={a.name} className="h-6 w-6 rounded-full object-cover" />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-700 text-xs text-white">{a.name[0]?.toUpperCase()}</span>
              )}
              {a.name}
              <button onClick={() => detachMutation.mutate(a.id)} aria-label={`Xóa ${a.name}`} className="text-ink-400 hover:text-red-600">
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <button onClick={() => { setError(null); setQuery(""); setPicking(true); }} className="btn-secondary mt-4">
        + Chọn nghệ sĩ
      </button>

      {picking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPicking(false)}>
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl bg-white p-5 shadow-pop" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h4 className="text-base font-bold text-ink-800">Chọn nghệ sĩ đang hoạt động</h4>
              <button onClick={() => setPicking(false)} aria-label="Đóng" className="text-ink-400 hover:text-ink-800">
                ✕
              </button>
            </div>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm theo tên..." className="input mt-3" />
            <div className="mt-3 min-h-0 flex-1 divide-y divide-ink-100 overflow-y-auto">
              {loadingMine ? (
                <p className="py-6 text-center text-sm text-ink-400">Đang tải...</p>
              ) : active.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-400">
                  {term ? "Không có nghệ sĩ nào khớp." : "Bạn chưa có nghệ sĩ nào đang hoạt động. Gửi yêu cầu thêm nghệ sĩ ở mục Nghệ sĩ, chờ quản trị viên duyệt."}
                </p>
              ) : (
                active.map((a) => {
                  const added = attachedIds.has(a.id);
                  return (
                    <button
                      key={a.id}
                      disabled={added || attachMutation.isPending}
                      onClick={() => attachMutation.mutate({ id: a.id, name: a.name, avatarUrl: a.avatarUrl ?? null })}
                      className="flex w-full items-center gap-3 px-2 py-2.5 text-left hover:bg-ink-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    >
                      {a.avatarUrl ? (
                        <img src={a.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-800 text-sm font-bold text-white">{a.name[0]?.toUpperCase()}</span>
                      )}
                      <span className="flex-1 truncate font-semibold text-ink-900">{a.name}</span>
                      <span className={`text-xs font-semibold ${added ? "text-emerald-600" : "text-brand-600"}`}>{added ? "✓ Đã thêm" : "Thêm"}</span>
                    </button>
                  );
                })
              )}
            </div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <button onClick={() => setPicking(false)} className="btn-primary mt-4">
              Xong
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
