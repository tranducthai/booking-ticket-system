import { Link } from "react-router-dom";
import type { OrganizerProfile } from "../../api/types";

/** "Nhà tổ chức nổi bật" — no per-organizer detail/event-filter page exists yet, so avatars are discovery-only; "Xem thêm" is the only link, into the full directory (OrganizersPage). */
export function FeaturedStars({ organizers }: { organizers: OrganizerProfile[] }) {
  if (organizers.length === 0) return null;

  return (
    <section className="bg-ink-900 py-10">
      <div className="container-page">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">⭐</span>
            <h2 className="text-2xl text-white">Nhà tổ chức nổi bật</h2>
          </div>
          <Link to="/nha-to-chuc" className="text-sm font-semibold text-gold-400 hover:underline">
            Xem thêm →
          </Link>
        </div>
        <div className="flex gap-5 overflow-x-auto pb-2 [scrollbar-width:none]">
          {organizers.map((o) => (
            <div key={o.id} className="flex w-20 shrink-0 flex-col items-center gap-2 text-center sm:w-24">
              <div className="relative">
                {o.avatarUrl ? (
                  <img
                    src={o.avatarUrl}
                    alt={o.fullName}
                    className="h-16 w-16 rounded-full border-2 border-gold-500 object-cover sm:h-20 sm:w-20"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-gold-500 bg-ink-700 text-xl font-bold text-white sm:h-20 sm:w-20">
                    {o.fullName[0]?.toUpperCase()}
                  </div>
                )}
                {o.isOrganizerVerified && (
                  <span className="absolute -right-0.5 -bottom-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-ink-900">
                    <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3">
                      <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
              </div>
              <p className="line-clamp-2 text-xs font-semibold text-white/90">{o.fullName}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
