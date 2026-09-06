import { Link } from "react-router-dom";
import type { Artist } from "../../api/types";

/** "Nghệ sĩ nổi bật" — Ticketmaster calls these "Attractions" and gives each its own page listing upcoming shows (see ArtistDetailPage); this carousel is the homepage discovery entry point into that. */
export function FeaturedArtists({ artists }: { artists: Artist[] }) {
  if (artists.length === 0) return null;

  return (
    <section className="container-page py-8">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-2xl">🎤 Nghệ sĩ nổi bật</h2>
        <Link to="/nghe-si" className="text-sm font-semibold text-brand-600 hover:underline">
          Xem thêm →
        </Link>
      </div>
      <div className="flex gap-5 overflow-x-auto pb-2 [scrollbar-width:none]">
        {artists.map((a) => (
          <Link key={a.id} to={`/nghe-si/${a.id}`} className="flex w-20 shrink-0 flex-col items-center gap-2 text-center sm:w-24">
            <div className="relative">
              {a.avatarUrl ? (
                <img src={a.avatarUrl} alt={a.name} className="h-16 w-16 rounded-full object-cover ring-2 ring-brand-300 sm:h-20 sm:w-20" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-ink-800 text-xl font-bold text-white ring-2 ring-brand-300 sm:h-20 sm:w-20">
                  {a.name[0]?.toUpperCase()}
                </div>
              )}
              {a.isVerified && (
                <span className="absolute -right-0.5 -bottom-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-white">
                  <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3">
                    <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              )}
            </div>
            <p className="line-clamp-2 text-xs font-semibold text-ink-800">{a.name}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
