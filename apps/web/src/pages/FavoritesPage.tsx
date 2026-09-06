import { useQuery } from "@tanstack/react-query";
import { favoritesApi } from "../api/events";
import { EventCard, EventCardSkeleton } from "../components/events/EventCard";
import { EmptyState } from "../components/ui/EmptyState";
import { useFavorites } from "../hooks/useFavorites";

export function FavoritesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["favorites", "mine"],
    queryFn: () => favoritesApi.mine({ limit: 50 }),
  });
  const favorites = useFavorites(data?.data.map((e) => e.id) ?? []);

  return (
    <div className="container-page py-10">
      <h1 className="text-3xl">Sự kiện yêu thích</h1>

      {isLoading ? (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <EventCardSkeleton key={i} />
          ))}
        </div>
      ) : data?.data.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="Chưa lưu sự kiện nào" description="Bấm biểu tượng trái tim trên một sự kiện để lưu vào đây." />
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {data?.data.map((e) => (
            <EventCard key={e.id} event={e} favorited={favorites.isFavorited(e.id)} onToggleFavorite={() => favorites.toggle(e.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
