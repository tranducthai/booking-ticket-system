import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { organizersApi } from "../api/auth";
import { EmptyState } from "../components/ui/EmptyState";
import { PageSpinner } from "../components/ui/Spinner";

const PAGE_SIZE = 24;

export function OrganizersPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["organizers", page],
    queryFn: () => organizersApi.list({ page, limit: PAGE_SIZE }),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="container-page py-10">
      <h1 className="text-3xl">Nhà tổ chức nổi bật</h1>
      <p className="mt-1 text-sm text-ink-500">Các ban tổ chức đã được xác minh trên Ticketbox.</p>

      {isLoading ? (
        <PageSpinner />
      ) : data?.data.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="Chưa có nhà tổ chức nào được xác minh" description="Quay lại sau nhé." />
        </div>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-3 gap-6 sm:grid-cols-4 lg:grid-cols-6">
            {data?.data.map((o) => (
              <div key={o.id} className="flex flex-col items-center gap-2 text-center">
                <div className="relative">
                  {o.avatarUrl ? (
                    <img src={o.avatarUrl} alt={o.fullName} className="h-20 w-20 rounded-full border-2 border-brand-300 object-cover" />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-brand-300 bg-ink-800 text-2xl font-bold text-white">
                      {o.fullName[0]?.toUpperCase()}
                    </div>
                  )}
                  {o.isOrganizerVerified && (
                    <span className="absolute -right-0.5 -bottom-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-white">
                      <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
                        <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  )}
                </div>
                <p className="line-clamp-2 text-sm font-semibold text-ink-800">{o.fullName}</p>
              </div>
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
