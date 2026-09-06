import { Link } from "react-router-dom";
import type { EventItem } from "../../api/types";
import { EventCard } from "../events/EventCard";

export function CategoryRow({ name, slug, events }: { name: string; slug: string; events: EventItem[] }) {
  if (events.length === 0) return null;

  return (
    <section className="container-page py-8">
      <div className="mb-4 flex items-end justify-between">
        <h2 className="text-2xl">{name}</h2>
        <Link to={`/su-kien?category=${slug}`} className="text-sm font-semibold text-brand-600 hover:underline">
          Xem thêm →
        </Link>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none]">
        {events.map((e) => (
          <div key={e.id} className="w-[45vw] shrink-0 sm:w-[220px]">
            <EventCard event={e} />
          </div>
        ))}
      </div>
    </section>
  );
}
