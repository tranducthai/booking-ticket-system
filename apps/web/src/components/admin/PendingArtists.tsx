import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { artistsApi } from "../../api/artists";
import { apiErrorMessage } from "../../api/client";
import { formatDateTime } from "../../lib/format";
import { SocialLinks } from "../artists/SocialLinks";
import { Badge } from "../ui/Badge";

/** Admin: artists organizers asked to add. Approving lists and verifies the artist; rejecting needs a reason the organizer sees. */
export function PendingArtists() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["artists", "pending"], queryFn: () => artistsApi.pending() });
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const done = () => {
    setError(null);
    void qc.invalidateQueries({ queryKey: ["artists"] });
  };
  const approve = useMutation({ mutationFn: (id: string) => artistsApi.approve(id), onSuccess: done, onError: (e) => setError(apiErrorMessage(e, "Không thể duyệt.")) });
  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => artistsApi.reject(id, reason),
    onSuccess: done,
    onError: (e) => setError(apiErrorMessage(e, "Không thể từ chối.")),
  });

  if (!data || data.total === 0) return null;
  return (
    <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="font-bold text-ink-800">Yêu cầu thêm nghệ sĩ</h3>
        <Badge tone="warning">{data.total}</Badge>
      </div>
      <div className="space-y-2">
        {data.data.map((a) => (
          <div key={a.id} className="card p-4">
          <div className="flex flex-wrap items-center gap-4">
            {a.avatarUrl ? (
              <img src={a.avatarUrl} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink-800 font-bold text-white">{a.name[0]?.toUpperCase()}</span>
            )}
            <div className="min-w-0 flex-1">
              <a href={`/artists/${a.id}`} target="_blank" rel="noreferrer" className="font-bold text-ink-900 hover:text-brand-600">
                {a.name}
              </a>
              <p className="text-xs text-ink-500">Gửi lúc {formatDateTime(a.createdAt)}</p>
              {a.bio && openId !== a.id && <p className="mt-1 line-clamp-2 text-sm text-ink-600">{a.bio}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setOpenId(openId === a.id ? null : a.id)} className="btn-ghost">
                {openId === a.id ? "Thu gọn" : "Xem chi tiết"}
              </button>
              <button onClick={() => approve.mutate(a.id)} disabled={approve.isPending} className="btn-primary">
                Duyệt
              </button>
              <button
                onClick={() => {
                  const reason = window.prompt(`Lý do từ chối "${a.name}":`);
                  if (reason && reason.trim().length >= 3) reject.mutate({ id: a.id, reason: reason.trim() });
                }}
                disabled={reject.isPending}
                className="btn-secondary"
              >
                Từ chối
              </button>
            </div>
          </div>
          {openId === a.id && (
            <div className="mt-4 space-y-3 border-t border-ink-100 pt-4">
              {a.coverUrl ? (
                <img src={a.coverUrl} alt="" className="aspect-[5/1] w-full rounded-xl object-cover" />
              ) : (
                <p className="text-sm text-ink-400">Chưa có ảnh bìa.</p>
              )}
              <div>
                <p className="text-xs font-semibold uppercase text-ink-400">Giới thiệu</p>
                <p className="mt-1 whitespace-pre-line text-sm text-ink-700">{a.bio || "Chưa có giới thiệu."}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-ink-400">Mạng xã hội</p>
                {Object.values(a.socialLinks ?? {}).some(Boolean) ? <SocialLinks links={a.socialLinks} className="mt-1" showUrl /> : <p className="mt-1 text-sm text-ink-400">Chưa có link nào.</p>}
              </div>
            </div>
          )}
          </div>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
