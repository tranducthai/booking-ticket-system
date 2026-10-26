import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { EventItem } from "../api/types";
import { eventsApi } from "../api/events";
import { artistsApi } from "../api/artists";
import { CategoryRow } from "../components/home/CategoryRow";
import { HomeHero } from "../components/home/HomeHero";
import { FeaturedArtists } from "../components/home/FeaturedArtists";
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

  const { data: artists } = useQuery({
    queryKey: ["artists", "featured"],
    queryFn: () => artistsApi.search({ verified: true, limit: 12 }),
  });

  return (
    <div>
      <HomeHero events={allEvents} artistCount={artists?.total ?? 0} />

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
            <div key={row.slug}>
              {/* Artist carousel sits right above the music category row — the two are the same audience. */}
              {row.slug === "am-nhac" && <FeaturedArtists artists={artists?.data ?? []} />}
              <CategoryRow name={row.name} slug={row.slug} events={row.events} />
            </div>
          ))}
          {/* Fallback for a deployment with no "am-nhac" category (or no events in it yet) — the carousel still needs somewhere to show up. */}
          {!categoryRows.some((row) => row.slug === "am-nhac") && <FeaturedArtists artists={artists?.data ?? []} />}
        </>
      )}
    </div>
  );
}
