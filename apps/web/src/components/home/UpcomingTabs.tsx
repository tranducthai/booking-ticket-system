import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { EventItem } from "../../api/types";
import { EventCard } from "../events/EventCard";

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Cuối tuần này" / "Tháng này" — client-side date-range slices of the same event pool the rest of the homepage uses, no separate endpoint. */
export function UpcomingTabs({ events }: { events: EventItem[] }) {
  const [tab, setTab] = useState<"week" | "month">("week");

  const { weekEvents, monthEvents } = useMemo(() => {
    const now = Date.now();
    const weekEnd = now + 7 * DAY_MS;
    const monthEnd = now + 30 * DAY_MS;
    const upcoming = events.filter((e) => new Date(e.startTime).getTime() >= now);
    return {
      weekEvents: upcoming.filter((e) => new Date(e.startTime).getTime() <= weekEnd),
      monthEvents: upcoming.filter((e) => new Date(e.startTime).getTime() <= monthEnd),
    };
  }, [events]);

  const shown = (tab === "week" ? weekEvents : monthEvents).slice(0, 8);

  return (
    <section className="container-page py-8">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-6 border-b border-ink-100">
          <button
            onClick={() => setTab("week")}
            className={`-mb-px border-b-2 pb-2 text-base font-bold transition-colors ${
              tab === "week" ? "border-brand-500 text-brand-600" : "border-transparent text-ink-400 hover:text-ink-600"
            }`}
          >
            Cuối tuần này
          </button>
          <button
            onClick={() => setTab("month")}
            className={`-mb-px border-b-2 pb-2 text-base font-bold transition-colors ${
              tab === "month" ? "border-brand-500 text-brand-600" : "border-transparent text-ink-400 hover:text-ink-600"
            }`}
          >
            Tháng này
          </button>
        </div>
        <Link to="/su-kien" className="text-sm font-semibold text-brand-600 hover:underline">
          Xem thêm →
        </Link>
      </div>

      {shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-400">
          {tab === "week" ? "Chưa có sự kiện nào trong tuần này." : "Chưa có sự kiện nào trong tháng này."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      )}
    </section>
  );
}
