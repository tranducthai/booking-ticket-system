import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { eventsApi } from "../../api/events";

/**
 * Global secondary nav bar under the header, like Ticketbox's own — always
 * visible (Layout.tsx), not the same as the filter chips on EventsPage
 * (those are page-local and reflect the active filter; this is just quick
 * navigation into a category from anywhere on the site).
 */
export function CategoryNavBar() {
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: eventsApi.categories });
  if (!categories || categories.length === 0) return null;

  return (
    <div className="bg-ink-900 border-t-[3px] border-gold-500">
      <nav className="container-page flex items-center gap-6 overflow-x-auto py-2.5 text-sm font-semibold text-white/80">
        {categories.map((c) => (
          <Link
            key={c.id}
            to={`/su-kien?category=${c.slug}`}
            className="shrink-0 whitespace-nowrap transition-colors hover:text-gold-400"
          >
            {c.name}
          </Link>
        ))}
      </nav>
    </div>
  );
}
