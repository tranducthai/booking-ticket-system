import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { eventsApi } from "../api/events";
import { EventCard, EventCardSkeleton } from "../components/events/EventCard";
import { useFavorites } from "../hooks/useFavorites";

export function HomePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["events", "home"],
    queryFn: () => eventsApi.search({ limit: 10 }),
  });
  const upcoming = data?.data ?? [];
  const favorites = useFavorites(useMemo(() => upcoming.map((e) => e.id), [upcoming]));

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
        {!isLoading && upcoming.length === 0 && (
          <p className="py-16 text-center text-ink-500">Chưa có sự kiện nào được công khai — hãy quay lại sau.</p>
        )}
      </section>
    </div>
  );
}
