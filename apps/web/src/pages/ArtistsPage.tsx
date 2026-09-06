import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { artistsApi } from "../api/artists";
import { EmptyState } from "../components/ui/EmptyState";
import { PageSpinner } from "../components/ui/Spinner";

const PAGE_SIZE = 24;

export function ArtistsPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["artists", "directory", page],
    queryFn: () => artistsApi.search({ verified: true, page, limit: PAGE_SIZE }),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="container-page py-10">
      <h1 className="text-3xl">Nghệ sĩ nổi bật</h1>
      <p className="mt-1 text-sm text-ink-500">Các nghệ sĩ đã được xác minh trên Ticketbox.</p>

      {isLoading ? (
        <PageSpinner />
      ) : data?.data.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="Chưa có nghệ sĩ nào được xác minh" description="Quay lại sau nhé." />
        </div>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-3 gap-6 sm:grid-cols-4 lg:grid-cols-6">
            {data?.data.map((a) => (
              <Link key={a.id} to={`/nghe-si/${a.id}`} className="flex flex-col items-center gap-2 text-center">
                <div className="relative">
                  {a.avatarUrl ? (
                    <img src={a.avatarUrl} alt={a.name} className="h-20 w-20 rounded-full object-cover ring-2 ring-brand-300" />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-ink-800 text-2xl font-bold text-white ring-2 ring-brand-300">
                      {a.name[0]?.toUpperCase()}
                    </div>
                  )}
                  {a.isVerified && (
                    <span className="absolute -right-0.5 -bottom-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-white">
                      <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
                        <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  )}
                </div>
                <p className="line-clamp-2 text-sm font-semibold text-ink-800">{a.name}</p>
              </Link>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-3">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="btn-secondary">
                Trước
              </button>
              <span className="text-sm text-ink-500">
                Trang {page}/{totalPages}
              </span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="btn-secondary">
                Sau
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
