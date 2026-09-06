import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { favoritesApi } from "../api/events";

/** Shared by every place that renders a grid of EventCards (EventsPage, HomePage) so the heart button behaves consistently everywhere. */
export function useFavorites(eventIds: string[]) {
  const { isAuthenticated } = useAuth();
  const qc = useQueryClient();
  const sortedIds = [...eventIds].sort();

  const { data } = useQuery({
    queryKey: ["favorites", "ids", sortedIds],
    queryFn: () => favoritesApi.ids(sortedIds),
    enabled: isAuthenticated && sortedIds.length > 0,
  });
  const favorited = new Set(data ?? []);

  const toggle = useMutation({
    mutationFn: (eventId: string) => (favorited.has(eventId) ? favoritesApi.remove(eventId) : favoritesApi.add(eventId)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["favorites"] }),
  });

  return {
    // Only signed-in customers get the heart button at all — EventCard hides it when both favorited/onToggleFavorite are undefined.
    enabled: isAuthenticated,
    isFavorited: (eventId: string) => favorited.has(eventId),
    toggle: (eventId: string) => toggle.mutate(eventId),
  };
}
