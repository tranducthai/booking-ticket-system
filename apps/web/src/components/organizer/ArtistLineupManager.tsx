import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { artistsApi } from "../../api/artists";
import { apiErrorMessage } from "../../api/client";
import type { EventArtist } from "../../api/types";
import { check } from "../../lib/validation";
import { ArtistFields, artistFormError, artistPayload, EMPTY_ARTIST, type ArtistFormValue } from "../artists/ArtistForm";

export interface ArtistChip {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/**
 * "Lineup" (Eventbrite's own term — see Artist's doc comment in
 * schema.prisma) for events in a music/performance category. Search picks
 * an existing shared Artist record; "Tạo nghệ sĩ mới" is the escape hatch
 * when the artist doesn't exist yet — a full profile (avatar, cover, bio,
 * social links). A new artist starts unverified until an admin verifies it.
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
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState<ArtistFormValue | null>(null);
  const [error, setError] = useState<string | null>(null);

  const items: ArtistChip[] = eventId ? lineup.map((l) => ({ id: l.artistId, name: l.artist.name, avatarUrl: l.artist.avatarUrl ?? null })) : (draft?.value ?? []);
  const attachedIds = new Set(items.map((a) => a.id));

  const { data: results } = useQuery({
    queryKey: ["artists", "search", query],
    queryFn: () => artistsApi.search({ q: query, limit: 8 }),
    enabled: query.trim().length > 1,
  });

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
    onSuccess: () => {
      setQuery("");
      refresh();
    },
    onError: (err) => setError(apiErrorMessage(err, "Không thể thêm nghệ sĩ.")),
  });

  const createAndAttachMutation = useMutation({
    mutationFn: async () => {
      check(artistFormError(creating!));
      const artist = await artistsApi.create(artistPayload(creating!));
      await attach({ id: artist.id, name: artist.name, avatarUrl: artist.avatarUrl ?? null });
    },
    onSuccess: () => {
      setCreating(null);
      setQuery("");
      setError(null);
      refresh();
      void qc.invalidateQueries({ queryKey: ["artists"] });
    },
    onError: (err) => setError(apiErrorMessage(err, "Không thể tạo nghệ sĩ.")),
  });

  const detachMutation = useMutation({
    mutationFn: async (artistId: string) => {
      if (eventId) await artistsApi.lineup.detach(eventId, artistId);
      else draft?.onChange(items.filter((a) => a.id !== artistId));
    },
    onSuccess: refresh,
    onError: (err) => setError(apiErrorMessage(err, "Không thể xóa nghệ sĩ.")),
  });

  const noMatch = query.trim().length > 1 && results && results.data.length === 0;

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

      {creating ? (
        <div className="mt-4 rounded-xl border border-ink-100 bg-ink-50 p-4">
          <div className="mb-4 flex items-center justify-between">
            <p className="font-semibold text-ink-800">Tạo nghệ sĩ mới</p>
            <button onClick={() => setCreating(null)} className="text-sm text-ink-500 hover:text-ink-800">
              Huỷ
            </button>
          </div>
          <ArtistFields value={creating} onChange={setCreating} />
          <p className="mt-3 text-xs text-ink-500">
            Nghệ sĩ dùng chung cho mọi ban tổ chức. Sau khi tạo, hồ sơ chờ quản trị viên xác minh mới hiện trong danh sách nghệ sĩ — trang nghệ sĩ vẫn xem được qua sự kiện.
          </p>
          <button onClick={() => createAndAttachMutation.mutate()} disabled={createAndAttachMutation.isPending} className="btn-primary mt-4">
            {createAndAttachMutation.isPending ? "Đang tạo..." : "Tạo và thêm vào lineup"}
          </button>
        </div>
      ) : (
        <div className="mt-4">
          <div className="relative">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm nghệ sĩ có sẵn..." className="input" />
            {results && results.data.length > 0 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-ink-100 bg-white shadow-card">
                {results.data.map((a) => (
                  <button
                    key={a.id}
                    disabled={attachedIds.has(a.id)}
                    onClick={() => attachMutation.mutate({ id: a.id, name: a.name, avatarUrl: a.avatarUrl ?? null })}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {a.avatarUrl ? <img src={a.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" /> : <span className="h-6 w-6 rounded-full bg-ink-200" />}
                    {a.name} {a.isVerified && "✓"} {attachedIds.has(a.id) && "(đã thêm)"}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="mt-2 text-sm text-ink-500">
            {noMatch ? `Chưa có nghệ sĩ "${query.trim()}". ` : "Không tìm thấy nghệ sĩ? "}
            <button onClick={() => setCreating({ ...EMPTY_ARTIST, name: query.trim() })} className="font-semibold text-brand-600 hover:underline">
              + Tạo nghệ sĩ mới
            </button>
          </p>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
