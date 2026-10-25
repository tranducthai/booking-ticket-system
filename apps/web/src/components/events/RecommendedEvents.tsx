import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { eventsApi } from "../../api/events";
import { formatVnd } from "../../lib/format";

/**
 * "Có thể bạn cũng thích" under an event page — event-service's hybrid
 * recommender (content TF-IDF + co-favorites, see recommendations/recommender.ts).
 * Renders nothing when there's nothing to suggest.
 */
export function RecommendedEvents({ eventId }: { eventId: string }) {
  const { data } = useQuery({
    queryKey: ["recommendations", eventId],
    queryFn: () => eventsApi.recommendations(eventId, 8),
    staleTime: 5 * 60_000,
  });
  if (!data || data.length === 0) return null;

  return (
    <section className="container-page pb-16">
      <h2 className="text-center text-xl">Có thể bạn cũng thích</h2>
      <div className="mt-6 grid grid-cols-2 gap-5 lg:grid-cols-4">
        {data.map((e) => {
          const d = new Date(e.startTime);
          return (
            <Link key={e.id} to={`/su-kien/${e.id}`} className="group block">
              <div className="aspect-[16/10] overflow-hidden rounded-xl bg-gradient-to-br from-ink-700 to-ink-900">
                {e.bannerUrl ? (
                  <img src={e.bannerUrl} alt={e.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                ) : (
                  <div className="flex h-full items-center justify-center p-3 text-center text-sm font-bold text-white/80">{e.title}</div>
                )}
              </div>
              <p className="mt-2.5 line-clamp-2 text-sm font-bold text-ink-900 group-hover:text-brand-600">{e.title}</p>
              {e.minPrice != null && <p className="mt-1 text-sm font-extrabold text-emerald-600">{e.minPrice === 0 ? "Miễn phí" : `Từ ${formatVnd(e.minPrice)}`}</p>}
              <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-500">
                <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 shrink-0">
                  <path d="M12 21s7-6.5 7-11.5A7 7 0 105 9.5C5 14.5 12 21 12 21Z" stroke="currentColor" strokeWidth="1.8" />
                </svg>
                {e.city} • {d.getDate()} Th {d.getMonth() + 1}
              </p>
              {e.reason && <p className="mt-1 text-[11px] font-semibold text-ink-400">{e.reason}</p>}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
