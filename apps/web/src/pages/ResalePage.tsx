import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { resaleApi } from "../api/resale";
import { ResaleListingCard, useResaleContext } from "../components/resale/ResaleListingCard";
import { EventCard } from "../components/events/EventCard";
import { EmptyState } from "../components/ui/EmptyState";
import { PageSpinner } from "../components/ui/Spinner";
import { formatDateTime } from "../lib/format";

type Tab = "khach" | "btc";
const PAGE_SIZE = 12;

/**
 * "Bán lại vé": tickets other customers resell (capped at what they paid),
 * and events whose organizer reopened unsold tickets after the deadline.
 */
export function ResalePage() {
  const [tab, setTab] = useState<Tab>("khach");
  return (
    <div className="container-page py-10">
      <div className="flex gap-1 border-b border-ink-100">
        {(
          [
            ["khach", "Vé khách bán lại"],
            ["btc", "BTC mở bán lại"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold ${tab === value ? "border-brand-500 text-brand-600" : "border-transparent text-ink-500 hover:text-ink-800"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6">{tab === "khach" ? <CustomerListings /> : <LateSales />}</div>
    </div>
  );
}

function CustomerListings() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({ queryKey: ["resale", "listings", page], queryFn: () => resaleApi.list({ page, limit: PAGE_SIZE }) });
  const listings = data?.data ?? [];
  const ctx = useResaleContext(listings);
  if (isLoading) return <PageSpinner />;
  if (listings.length === 0) return <EmptyState title="Chưa có vé bán lại" description="Quay lại sau — vé được rao bán mỗi ngày." />;
  const pages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {listings.map((l) => (
          <ResaleListingCard key={l.id} listing={l} event={ctx.event(l)} zone={ctx.zoneLabel(l)} />
        ))}
      </div>
      {pages > 1 && (
        <div className="mt-6 flex justify-center gap-2">
          <button disabled={page === 1} onClick={() => setPage(page - 1)} className="btn-secondary disabled:opacity-40">
            ‹ Trước
          </button>
          <span className="px-3 py-2 text-sm text-ink-500">
            {page}/{pages}
          </span>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="btn-secondary disabled:opacity-40">
            Sau ›
          </button>
        </div>
      )}
    </>
  );
}

function LateSales() {
  const { data, isLoading } = useQuery({ queryKey: ["events", "late-sales"], queryFn: resaleApi.lateSales });
  if (isLoading) return <PageSpinner />;
  if (!data || data.length === 0) return <EmptyState title="Chưa có sự kiện mở bán lại" description="Khi ban tổ chức mở bán vé còn trống sau hạn, sự kiện sẽ xuất hiện ở đây." />;
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {data.map((e) => (
        <div key={e.id}>
          <EventCard event={e} />
          <p className="mt-1 text-xs font-semibold text-emerald-700">Mở bán lại đến {formatDateTime(e.lateSalesUntil!)}</p>
        </div>
      ))}
    </div>
  );
}
