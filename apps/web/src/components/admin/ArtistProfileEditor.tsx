import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { artistsApi } from "../../api/artists";
import { apiErrorMessage } from "../../api/client";
import { check } from "../../lib/validation";
import { ArtistFields, artistFormError, artistPayload, artistToForm, EMPTY_ARTIST } from "../artists/ArtistForm";

/** Admin: what the artist page shows above the tabs — name, avatar, cover, bio, social links. */
export function ArtistProfileEditor({ artistId }: { artistId: string }) {
  const qc = useQueryClient();
  const { data: artist } = useQuery({ queryKey: ["artist", artistId], queryFn: () => artistsApi.getById(artistId) });
  const [form, setForm] = useState(EMPTY_ARTIST);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (artist) setForm(artistToForm(artist));
  }, [artist]);

  const save = useMutation({
    mutationFn: () => {
      check(artistFormError(form));
      return artistsApi.update(artistId, artistPayload(form));
    },
    onSuccess: () => {
      setError(null);
      setSaved(true);
      void qc.invalidateQueries({ queryKey: ["artist", artistId] });
      void qc.invalidateQueries({ queryKey: ["artists"] });
    },
    onError: (err) => setError(apiErrorMessage(err, "Không thể lưu hồ sơ nghệ sĩ.")),
  });

  if (!artist) return <p className="text-sm text-ink-400">Đang tải...</p>;
  return (
    <div className="space-y-4 rounded-xl bg-ink-50 p-4">
      <ArtistFields
        value={form}
        onChange={(v) => {
          setSaved(false);
          setForm(v);
        }}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button onClick={() => save.mutate()} disabled={save.isPending} className="btn-primary">
          {save.isPending ? "Đang lưu..." : "Lưu hồ sơ"}
        </button>
        {saved && <span className="text-sm text-emerald-600">Đã lưu ✓</span>}
      </div>
    </div>
  );
}
