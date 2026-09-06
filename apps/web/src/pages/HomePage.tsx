import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { EventItem } from "../api/types";
import { eventsApi } from "../api/events";
import { CategoryRow } from "../components/home/CategoryRow";
import { TrendingCarousel } from "../components/home/TrendingCarousel";
import { UpcomingTabs } from "../components/home/UpcomingTabs";
import { EventCard, EventCardSkeleton } from "../components/events/EventCard";
import { useFavorites } from "../hooks/useFavorites";

// Big enough pool for the trending pick / weekly-monthly filter / per-category
// rows below to have something to work with, small enough to stay one request.
const HOME_POOL_LIMIT = 60;

export function HomePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["events", "home"],
    queryFn: () => eventsApi.search({ limit: HOME_POOL_LIMIT }),
  });
  const allEvents = useMemo(() => data?.data ?? [], [data]);
  const upcoming = useMemo(() => allEvents.slice(0, 10), [allEvents]);
  const favorites = useFavorites(useMemo(() => upcoming.map((e) => e.id), [upcoming]));

  // "Trending" — no real popularity metric in this system, so this is a
  // presentation-only proxy: events the organizer flagged high_demand first,
  // then whatever starts soonest. See TrendingCarousel's own doc comment.
  const trending = useMemo(
    () =>
      [...allEvents]
        .sort((a, b) => Number(b.highDemand) - Number(a.highDemand) || new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
        .slice(0, 6),
    [allEvents],
  );

  const categoryRows = useMemo(() => {
    const byCategory = new Map<string, { name: string; slug: string; events: EventItem[] }>();
    for (const e of allEvents) {
      if (!e.category) continue;
      const entry = byCategory.get(e.category.id) ?? { name: e.category.name, slug: e.category.slug, events: [] };
      if (entry.events.length < 8) entry.events.push(e);
      byCategory.set(e.category.id, entry);
    }
    return [...byCategory.values()];
  }, [allEvents]);

  return (
    <div>
      <section className="relative overflow-hidden bg-ink-900">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(232,70,42,0.35),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(245,178,27,0.25),_transparent_50%)]" />
        <div className="container-page relative py-16 sm:py-24">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand-200">
            Nền tảng vé sự kiện
          </p>
          <h1 className="max-w-2xl text-4xl font-extrabold leading-tight text-white sm:text-5xl">
            Giữ chỗ, thanh toán, và có vé trong tay — chỉ trong vài phút.
          </h1>
          <p className="mt-4 max-w-xl text-ink-200">
            Từ concert, sân khấu kịch đến hội thảo — tìm sự kiện, chọn ghế, và nhận vé điện tử có mã QR chống giả.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/su-kien" className="btn-primary px-6 py-3 text-base">
              Khám phá sự kiện
            </Link>
            <Link to="/kenh-to-chuc" className="btn px-6 py-3 text-base font-semibold text-white ring-1 ring-inset ring-white/30 hover:bg-white/10">
              Tạo sự kiện của bạn
            </Link>
          </div>
        </div>
      </section>

      <section className="container-page py-12">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="text-2xl">Sự kiện sắp diễn ra</h2>
          <Link to="/su-kien" className="text-sm font-semibold text-brand-600 hover:underline">
            Xem tất cả →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {isLoading
            ? Array.from({ length: 5 }).map((_, i) => <EventCardSkeleton key={i} />)
            : upcoming.map((e) => (
                <EventCard
                  key={e.id}
                  event={e}
                  favorited={favorites.enabled ? favorites.isFavorited(e.id) : undefined}
                  onToggleFavorite={favorites.enabled ? () => favorites.toggle(e.id) : undefined}
                />
              ))}
        </div>
        {!isLoading && allEvents.length === 0 && (
          <p className="py-16 text-center text-ink-500">Chưa có sự kiện nào được công khai — hãy quay lại sau.</p>
        )}
      </section>

      {!isLoading && (
        <>
          <TrendingCarousel events={trending} />
          <UpcomingTabs events={allEvents} />
          {categoryRows.map((row) => (
            <CategoryRow key={row.slug} name={row.name} slug={row.slug} events={row.events} />
          ))}
        </>
      )}
    </div>
  );
}
