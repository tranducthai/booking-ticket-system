import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api/client";
import { artistsApi } from "../../api/artists";
import { Badge } from "../../components/ui/Badge";
import { PageSpinner } from "../../components/ui/Spinner";
import { MembershipPlanEditor } from "../../components/admin/MembershipPlanEditor";
import { ArtistProfileEditor } from "../../components/admin/ArtistProfileEditor";

export function AdminArtistsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<{ id: string; panel: "profile" | "plan" } | null>(null);
  const toggle = (id: string, panel: "profile" | "plan") => setOpen(open?.id === id && open.panel === panel ? null : { id, panel });
  const { data, isLoading } = useQuery({
    queryKey: ["artists", "admin", q],
    queryFn: () => artistsApi.search({ q: q || undefined, limit: 50 }),
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
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên..." className="input w-64" />
      </div>

      {isLoading ? (
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
                {a.isVerified && <Badge tone="success">Đã xác minh</Badge>}
              </div>
              <div className="flex items-center gap-2">
                <a href={`/nghe-si/${a.id}`} target="_blank" rel="noreferrer" className="btn-ghost">
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
