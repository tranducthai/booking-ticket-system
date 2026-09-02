import { Link } from "react-router-dom";
import type { EventItem } from "../../api/types";
import { formatDayMonth, formatVnd } from "../../lib/format";

export function EventCard({ event, priceFrom }: { event: EventItem; priceFrom?: string }) {
  const { day, month } = formatDayMonth(event.startTime);
  return (
    <Link
      to={`/su-kien/${event.id}`}
      className="card group block overflow-hidden transition-transform hover:-translate-y-1 hover:shadow-lg"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-gradient-to-br from-brand-400 to-brand-700">
        {event.bannerUrl ? (
          <img
            src={event.bannerUrl}
            alt={event.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-4 text-center">
            <span className="text-sm font-bold text-white/90 line-clamp-4">{event.title}</span>
          </div>
        )}
        <div className="absolute left-3 top-3 rounded-lg bg-white/95 px-2.5 py-1.5 text-center shadow">
          <div className="text-base font-extrabold leading-none text-brand-500">{day}</div>
          <div className="text-[10px] font-bold uppercase leading-none text-ink-500">{month}</div>
        </div>
      </div>
      <div className="p-4">
        <h3 className="line-clamp-2 min-h-[2.75rem] font-bold text-ink-900">{event.title}</h3>
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-500">
          <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 shrink-0">
            <path d="M12 21s7-6.5 7-11.5A7 7 0 105 9.5C5 14.5 12 21 12 21Z" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="12" cy="9.5" r="2.2" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          <span className="truncate">{event.venueName}</span>
        </p>
        {priceFrom && <p className="mt-2 text-sm font-bold text-brand-600">Từ {formatVnd(priceFrom)}</p>}
      </div>
    </Link>
  );
}

export function EventCardSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="aspect-[4/5] animate-pulse bg-ink-100" />
      <div className="space-y-2 p-4">
        <div className="h-4 w-4/5 animate-pulse rounded bg-ink-100" />
        <div className="h-3 w-3/5 animate-pulse rounded bg-ink-100" />
      </div>
    </div>
  );
}
