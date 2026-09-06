import { useRef } from "react";
import { Link } from "react-router-dom";
import type { EventItem } from "../../api/types";

/**
 * "Sự kiện xu hướng" — this system has no real popularity/view-count metric
 * to rank by, so HomePage picks the input list (highDemand events first,
 * then soonest-starting) and this component is purely presentational: a
 * horizontally-scrollable strip with a big number over each banner.
 */
export function TrendingCarousel({ events }: { events: EventItem[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  function scrollBy(delta: number) {
    scrollerRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  }

  if (events.length === 0) return null;

  return (
    <section className="container-page py-8">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-xl">🔥</span>
        <h2 className="text-2xl">Sự kiện xu hướng</h2>
      </div>
      <div className="relative">
        <div ref={scrollerRef} className="flex snap-x gap-4 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none]">
          {events.map((event, i) => (
            <Link
              key={event.id}
              to={`/su-kien/${event.id}`}
              className="group relative aspect-video w-[280px] shrink-0 snap-start overflow-hidden rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 shadow-card sm:w-[340px]"
            >
              {event.bannerUrl ? (
                <img
                  src={event.bannerUrl}
                  alt={event.title}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center p-4 text-center">
                  <span className="text-sm font-bold text-white/90 line-clamp-3">{event.title}</span>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-ink-900/80 via-transparent to-transparent" />
              <span
                className="absolute -bottom-2 left-2 text-7xl font-extrabold italic text-gold-400/90"
                style={{ WebkitTextStroke: "2px #7E1F15", textShadow: "3px 3px 0 rgba(0,0,0,.25)" }}
              >
                {i + 1}
              </span>
              <p className="absolute bottom-2 left-16 right-3 line-clamp-2 text-sm font-bold text-white">{event.title}</p>
            </Link>
          ))}
        </div>
        <button
          type="button"
          onClick={() => scrollBy(360)}
          aria-label="Xem thêm sự kiện xu hướng"
          className="absolute right-0 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-card hover:bg-ink-50 sm:flex"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </section>
  );
}
