import { useMutation, useQueries } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiErrorMessage } from "../../api/client";
import { eventsApi } from "../../api/events";
import { resaleApi } from "../../api/resale";
import type { EventItem, ResaleListing, SeatMapLayout } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { formatDateTime, formatVnd } from "../../lib/format";

/**
 * Loads what resale cards need beyond the listing itself: each event, and
 * the seat-map layout of events with seat listings (to name zone + seat).
 */
export function useResaleContext(listings: ResaleListing[]) {
  const eventIds = useMemo(() => [...new Set(listings.map((l) => l.eventId))], [listings]);
  const seatEventIds = useMemo(() => [...new Set(listings.filter((l) => l.seatId).map((l) => l.eventId))], [listings]);
  const events = useQueries({
    queries: eventIds.map((id) => ({ queryKey: ["event", id], queryFn: () => eventsApi.getById(id), staleTime: 5 * 60_000, retry: false })),
  });
  const layouts = useQueries({
    queries: seatEventIds.map((id) => ({ queryKey: ["seat-map-layout", id], queryFn: () => eventsApi.seatMap.getLayout(id), staleTime: 5 * 60_000, retry: false })),
  });
  const eventById = new Map<string, EventItem>();
  events.forEach((q) => q.data && eventById.set(q.data.id, q.data));
  const layoutByEvent = new Map<string, SeatMapLayout>();
  layouts.forEach((q) => q.data && layoutByEvent.set(q.data.eventId, q.data));

  const zoneLabel = (l: ResaleListing): string => {
    if (l.seatId) {
      const layout = layoutByEvent.get(l.eventId);
      for (const z of layout?.zones ?? []) {
        const seat = z.seats.find((s) => s.id === l.seatId);
        if (seat) return `${z.name} · Ghế ${seat.row}${seat.number}`;
      }
      return "Ghế ngồi";
    }
    return eventById.get(l.eventId)?.ticketTypes?.find((t) => t.id === l.ticketTypeId)?.name ?? "Vé";
  };
  return { event: (l: ResaleListing) => eventById.get(l.eventId), zoneLabel };
}

/** Marketplace card — Ticketbox resale style: "Bán lẻ", RSL code, quantity, showtime, zone, price per ticket. */
export function ResaleListingCard({ listing, event, zone, compact }: { listing: ResaleListing; event?: EventItem; zone: string; compact?: boolean }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const buy = useMutation({
    mutationFn: () => resaleApi.buy(listing.id),
    onSuccess: (order) => navigate(`/checkout/${order.id}`),
    onError: (err) => setError(apiErrorMessage(err, "Không thể mua vé này.")),
  });
  const discount = Number(listing.facePrice) - Number(listing.price);

  return (
    <div className="card flex flex-col overflow-hidden">
      {!compact && event?.bannerUrl && (
        <Link to={`/resale/${listing.id}`}>
          <img src={event.bannerUrl} alt="" className="aspect-[16/7] w-full object-cover" />
        </Link>
      )}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">Bán lẻ</span>
          <span className="font-mono text-xs text-ink-400">{listing.code}</span>
        </div>
        {!compact && (
          <Link to={`/resale/${listing.id}`} className="mt-2 line-clamp-2 font-bold text-ink-900 hover:text-brand-600">
            {event?.title ?? "Sự kiện"}
          </Link>
        )}
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-500">Số lượng</dt>
            <dd className="font-semibold text-ink-800">1 vé</dd>
          </div>
          {event && (
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">Suất diễn</dt>
              <dd className="text-right font-semibold text-ink-800">{formatDateTime(event.startTime)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <dt className="text-ink-500">Khu vực</dt>
            <dd className="text-right font-semibold text-ink-800">{zone}</dd>
          </div>
        </dl>
        <div className="mt-auto flex items-end justify-between gap-3 border-t border-ink-100 pt-3">
          <div>
            <p className="text-xs text-ink-500">Giá / vé</p>
            <p className="text-lg font-extrabold text-brand-600">{formatVnd(listing.price)}</p>
            {discount > 0 && <p className="text-xs text-ink-400 line-through">{formatVnd(listing.facePrice)}</p>}
          </div>
          <button
            onClick={() => {
              setError(null);
              if (!isAuthenticated) {
                navigate("/login", { state: { from: { pathname: "/resale" } } });
                return;
              }
              buy.mutate();
            }}
            disabled={buy.isPending}
            className="btn-primary px-4 py-2 text-sm"
          >
            {buy.isPending ? "Đang giữ..." : "Mua vé"}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
