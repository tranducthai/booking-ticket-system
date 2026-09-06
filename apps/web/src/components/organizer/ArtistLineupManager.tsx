import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { artistsApi } from "../../api/artists";
import { apiErrorMessage } from "../../api/client";
import type { EventArtist } from "../../api/types";

/**
 * "Lineup" (Eventbrite's own term — see Artist's doc comment in
 * schema.prisma) for events in a music/performance category. Search picks
 * an existing shared Artist record; "Tạo nghệ sĩ mới" is the escape hatch
 * when the artist doesn't exist yet, creating + attaching in one step.
 */
export function ArtistLineupManager({ eventId, lineup }: { eventId: string; lineup: EventArtist[] }) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [newArtistName, setNewArtistName] = useState("");
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
      const artist = await artistsApi.create({ name: newArtistName.trim() });
      return artistsApi.lineup.attach(eventId, artist.id);
    },
    onSuccess: () => {
      setNewArtistName("");
      invalidateEvent();
    },
    onError: (err) => setError(apiErrorMessage(err, "Không thể tạo nghệ sĩ.")),
  });

  const detachMutation = useMutation({
    mutationFn: (artistId: string) => artistsApi.lineup.detach(eventId, artistId),
    onSuccess: invalidateEvent,
    onError: (err) => setError(apiErrorMessage(err, "Không thể xóa nghệ sĩ.")),
  });

  const attachedIds = new Set(lineup.map((l) => l.artistId));

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
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-700 text-xs text-white">
                  {l.artist.name[0]?.toUpperCase()}
                </span>
              )}
              {l.artist.name}
              <button
                onClick={() => detachMutation.mutate(l.artistId)}
                aria-label={`Xóa ${l.artist.name}`}
                className="text-ink-400 hover:text-red-600"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm nghệ sĩ có sẵn..."
            className="input"
          />
          {results && results.data.length > 0 && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-ink-100 bg-white shadow-card">
              {results.data.map((a) => (
                <button
                  key={a.id}
                  disabled={attachedIds.has(a.id)}
                  onClick={() => attachMutation.mutate(a.id)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {a.name} {a.isVerified && "✓"} {attachedIds.has(a.id) && "(đã thêm)"}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <input
            value={newArtistName}
            onChange={(e) => setNewArtistName(e.target.value)}
            placeholder="...hoặc tạo nghệ sĩ mới"
            className="input"
          />
          <button
            onClick={() => createAndAttachMutation.mutate()}
            disabled={!newArtistName.trim() || createAndAttachMutation.isPending}
            className="btn-secondary shrink-0"
          >
            + Tạo
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
