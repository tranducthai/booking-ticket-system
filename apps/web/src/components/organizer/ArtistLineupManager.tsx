import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { artistsApi } from "../../api/artists";
import { apiErrorMessage } from "../../api/client";
import type { EventArtist } from "../../api/types";
import { check } from "../../lib/validation";
import { ArtistFields, artistFormError, artistPayload, EMPTY_ARTIST, type ArtistFormValue } from "../artists/ArtistForm";

/**
 * "Lineup" (Eventbrite's own term — see Artist's doc comment in
 * schema.prisma) for events in a music/performance category. Search picks
 * an existing shared Artist record; "Tạo nghệ sĩ mới" is the escape hatch
 * when the artist doesn't exist yet — a full profile (avatar, cover, bio,
 * social links), created and attached in one step. A new artist starts
 * unverified until an admin verifies it.
 */
export function ArtistLineupManager({ eventId, lineup }: { eventId: string; lineup: EventArtist[] }) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState<ArtistFormValue | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: results } = useQuery({
    queryKey: ["artists", "search", query],
    queryFn: () => artistsApi.search({ q: query, limit: 8 }),
    enabled: query.trim().length > 1,
  });

  const invalidateEvent = () => qc.invalidateQueries({ queryKey: ["event", eventId] });

  const attachMutation = useMutation({
    mutationFn: (artistId: string) => artistsApi.lineup.attach(eventId, artistId),
    onSuccess: () => {
      setQuery("");
      invalidateEvent();
    },
    onError: (err) => setError(apiErrorMessage(err, "Không thể thêm nghệ sĩ.")),
  });

  const createAndAttachMutation = useMutation({
    mutationFn: async () => {
      check(artistFormError(creating!));
      const artist = await artistsApi.create(artistPayload(creating!));
      return artistsApi.lineup.attach(eventId, artist.id);
    },
    onSuccess: () => {
      setCreating(null);
      setQuery("");
      setError(null);
      invalidateEvent();
      void qc.invalidateQueries({ queryKey: ["artists"] });
    },
    onError: (err) => setError(apiErrorMessage(err, "Không thể tạo nghệ sĩ.")),
  });

  const detachMutation = useMutation({
    mutationFn: (artistId: string) => artistsApi.lineup.detach(eventId, artistId),
    onSuccess: invalidateEvent,
    onError: (err) => setError(apiErrorMessage(err, "Không thể xóa nghệ sĩ.")),
  });

  const attachedIds = new Set(lineup.map((l) => l.artistId));
  const noMatch = query.trim().length > 1 && results && results.data.length === 0;

  return (
    <div className="card p-6">
      <h3 className="text-base font-bold text-ink-800">Nghệ sĩ tham gia (Lineup)</h3>

      {lineup.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {lineup.map((l) => (
            <span key={l.id} className="flex items-center gap-2 rounded-full bg-ink-100 py-1.5 pl-1.5 pr-3 text-sm font-semibold text-ink-700">
              {l.artist.avatarUrl ? (
                <img src={l.artist.avatarUrl} alt={l.artist.name} className="h-6 w-6 rounded-full object-cover" />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-700 text-xs text-white">{l.artist.name[0]?.toUpperCase()}</span>
              )}
              {l.artist.name}
              <button onClick={() => detachMutation.mutate(l.artistId)} aria-label={`Xóa ${l.artist.name}`} className="text-ink-400 hover:text-red-600">
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
                    onClick={() => attachMutation.mutate(a.id)}
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
