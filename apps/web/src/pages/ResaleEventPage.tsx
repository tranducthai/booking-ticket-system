import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { eventsApi } from "../api/events";
import { resaleApi } from "../api/resale";
import { ResaleListingCard, useResaleContext } from "../components/resale/ResaleListingCard";
import { EmptyState } from "../components/ui/EmptyState";
import { PageSpinner } from "../components/ui/Spinner";
import { formatDateTimeRange } from "../lib/format";

/** One event's resale tickets — what you land on after picking the event on /resale. */
export function ResaleEventPage() {
  const { eventId = "" } = useParams();
  const { data: event, isLoading: eventLoading } = useQuery({ queryKey: ["event", eventId], queryFn: () => eventsApi.getById(eventId), retry: false });
  const { data, isLoading } = useQuery({ queryKey: ["resale", "listings", "event", eventId], queryFn: () => resaleApi.list({ eventId, limit: 100 }) });
  const listings = data?.data ?? [];
  const ctx = useResaleContext(listings);

  if (eventLoading || isLoading) return <PageSpinner />;

  return (
    <div>
      <div className="bg-ink-900 text-white">
        <div className="container-page flex flex-wrap items-center gap-6 py-8">
          {event?.bannerUrl && <img src={event.bannerUrl} alt="" className="aspect-[16/9] w-full max-w-md rounded-xl object-cover" />}
          <div className="min-w-0 flex-1 space-y-2">
            <span className="rounded-md bg-emerald-500 px-2 py-0.5 text-xs font-bold text-white">Bán lại vé</span>
            <h1 className="text-2xl font-extrabold leading-tight text-white sm:text-3xl">{event?.title ?? "Sự kiện"}</h1>
            {event && (
              <>
                <p className="text-sm font-semibold text-emerald-300">{formatDateTimeRange(event.startTime, event.endTime)}</p>
                <p className="text-sm text-white/80">{event.isOnline ? `Sự kiện trực tuyến · ${event.venueName}` : `${event.venueName} · ${event.venueAddress}`}</p>
                <Link to={`/events/${event.id}`} className="inline-block text-sm font-semibold text-white/90 underline">
                  Xem trang sự kiện
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="container-page py-8">
        <Link to="/resale" className="text-sm font-semibold text-ink-500 hover:text-ink-700">
          ← Tất cả sự kiện bán lại
        </Link>
        <h2 className="mt-3 text-xl font-extrabold">Danh sách vé bán lại</h2>
        <div className="mt-5">
          {listings.length === 0 ? (
            <EmptyState title="Chưa có vé bán lại cho sự kiện này" description="Quay lại sau — vé được rao bán mỗi ngày." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {listings.map((l) => (
                <ResaleListingCard key={l.id} listing={l} event={ctx.event(l)} zone={ctx.zoneLabel(l)} compact />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
