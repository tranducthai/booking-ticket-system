import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { artistsApi } from "../api/artists";
import { EventCard } from "../components/events/EventCard";
import { EmptyState } from "../components/ui/EmptyState";
import { PageSpinner } from "../components/ui/Spinner";

const SOCIAL_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
  spotify: "Spotify",
  tiktok: "TikTok",
};

export function ArtistDetailPage() {
  const { id = "" } = useParams();
  const { data: artist, isLoading } = useQuery({ queryKey: ["artist", id], queryFn: () => artistsApi.getById(id) });

  if (isLoading || !artist) return <PageSpinner />;

  return (
    <div className="container-page max-w-4xl py-10">
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
        <div className="relative shrink-0">
          {artist.avatarUrl ? (
            <img src={artist.avatarUrl} alt={artist.name} className="h-28 w-28 rounded-full object-cover ring-4 ring-brand-200" />
          ) : (
            <div className="flex h-28 w-28 items-center justify-center rounded-full bg-ink-800 text-4xl font-bold text-white ring-4 ring-brand-200">
              {artist.name[0]?.toUpperCase()}
            </div>
          )}
        </div>
        <div>
          <div className="flex items-center justify-center gap-2 sm:justify-start">
            <h1 className="text-3xl">{artist.name}</h1>
            {artist.isVerified && (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500">
                <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
                  <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            )}
          </div>
          {artist.bio && <p className="mt-2 max-w-xl text-sm text-ink-600">{artist.bio}</p>}
          {artist.socialLinks && Object.keys(artist.socialLinks).length > 0 && (
            <div className="mt-3 flex flex-wrap justify-center gap-3 sm:justify-start">
              {Object.entries(artist.socialLinks).map(([key, url]) => (
                <a key={key} href={url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand-600 hover:underline">
                  {SOCIAL_LABELS[key] ?? key}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      <h2 className="mt-10 text-xl">Sự kiện sắp diễn ra</h2>
      {artist.upcomingEvents.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="Chưa có sự kiện sắp diễn ra" description="Quay lại sau để xem lịch diễn mới của nghệ sĩ này." />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {artist.upcomingEvents.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      )}
    </div>
  );
}
