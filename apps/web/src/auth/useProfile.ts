import { useQuery } from "@tanstack/react-query";
import { authApi } from "../api/auth";
import { useAuth } from "./AuthContext";

/**
 * The signed-in user's current name and picture. The auth context only holds
 * what the login returned (name at that moment, no picture), so it goes stale
 * after the profile is edited — this reads the same `["me"]` query the profile
 * page updates, falling back to the login data until it loads.
 */
export function useProfile() {
  const { user, isAuthenticated } = useAuth();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: authApi.me, enabled: isAuthenticated, staleTime: 5 * 60_000 });
  return { fullName: me?.fullName ?? user?.fullName ?? "", avatarUrl: me?.avatarUrl ?? null };
}
