import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { resaleApi } from "../api/resale";
import type { ResaleListing } from "../api/types";
import { useResaleContext } from "../components/resale/ResaleListingCard";
import { EventCard } from "../components/events/EventCard";
import { EmptyState } from "../components/ui/EmptyState";
import { PageSpinner } from "../components/ui/Spinner";
import { formatDate, formatDateTime } from "../lib/format";

type Tab = "khach" | "btc";

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

/** Events that currently have resale tickets; pick one to see its tickets (/resale/events/:eventId). */
function CustomerListings() {
  const { data: listings = [], isLoading } = useQuery({
    queryKey: ["resale", "listings", "all"],
    queryFn: async () => {
      const all: ResaleListing[] = [];
      for (let page = 1; page <= 10; page++) {
        const res = await resaleApi.list({ page, limit: 100 });
        all.push(...res.data);
        if (all.length >= res.total) break;
      }
      return all;
    },
  });
  const counts = new Map<string, number>();
  for (const l of listings) counts.set(l.eventId, (counts.get(l.eventId) ?? 0) + 1);
  const firstPerEvent = [...counts.keys()].map((eventId) => listings.find((l) => l.eventId === eventId)!);
  const ctx = useResaleContext(firstPerEvent);
  if (isLoading) return <PageSpinner />;
  if (listings.length === 0) return <EmptyState title="Chưa có vé bán lại" description="Quay lại sau — vé được rao bán mỗi ngày." />;

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {firstPerEvent.map((l) => {
        const event = ctx.event(l);
        const image = event?.bannerUrl || event?.posterUrl;
        return (
          <Link key={l.eventId} to={`/resale/events/${l.eventId}`} className="group block">
            <div className="aspect-[16/9] w-full overflow-hidden rounded-xl bg-gradient-to-br from-brand-400 to-brand-700">
              {image ? (
                <img src={image} alt={event?.title ?? ""} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
              ) : (
                <div className="flex h-full items-center justify-center p-4 text-center text-sm font-bold text-white/90 line-clamp-3">{event?.title}</div>
              )}
            </div>
            <p className="mt-3 line-clamp-2 font-bold text-ink-900 group-hover:text-brand-600">{event?.title ?? "Sự kiện"}</p>
            {event && <p className="mt-1 text-sm text-ink-600">{formatDate(event.startTime)}</p>}
            <p className="mt-0.5 text-xs font-semibold text-emerald-700">{counts.get(l.eventId)} vé đang bán lại</p>
          </Link>
        );
      })}
    </div>
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
