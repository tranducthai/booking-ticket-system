import { Link } from "react-router-dom";
import type { EventItem } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { formatDateTime } from "../../lib/format";

/** id of the homepage section "Khám phá sự kiện" scrolls to (pages/HomePage.tsx). */
export const HOME_EVENTS_ANCHOR = "su-kien-sap-dien-ra";

/**
 * Homepage hero: a full-bleed concert photo under a dark gradient (so the
 * text stays readable), one message and two choices — explore (scrolls down
 * to the events on this page) or create an event (organizer sign-up) — with
 * the next real event floating at the bottom right.
 */
export function HomeHero({ events }: { events: EventItem[]; artistCount?: number }) {
  const { role } = useAuth();
  const next = events.find((e) => e.bannerUrl);
  // Already an organizer/admin: straight to the event form instead of signing up again.
  const createHref = role === "ORGANIZER" || role === "ADMIN" ? "/kenh-to-chuc/su-kien/moi" : "/dang-ky?loai=ban-to-chuc";

  const explore = () => document.getElementById(HOME_EVENTS_ANCHOR)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <section className="relative isolate overflow-hidden bg-ink-900">
      <img src="/images/hero-concert.png" alt="" className="absolute inset-0 -z-20 h-full w-full object-cover object-center" />
      {/* darkens the left (text side) and the bottom edge, leaves the stage lights on the right bright */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink-900/90 via-ink-900/55 to-ink-900/10" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-32 bg-gradient-to-t from-ink-900/60 to-transparent" />

      <div className="container-page relative flex min-h-[540px] flex-col justify-center py-16">
        <p className="text-sm font-bold uppercase tracking-wider text-brand-300">Nền tảng vé sự kiện</p>
        <h1 className="mt-3 max-w-2xl text-4xl font-extrabold leading-[1.08] !text-white sm:text-[3.6rem]">Vé sự kiện, nhanh gọn và minh bạch.</h1>
        <p className="mt-4 max-w-lg text-base text-white/85">
          Tìm concert, sân khấu, workshop và nhận vé QR chống giả trong vài phút — hoặc tạo sự kiện và bán vé của riêng bạn.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button type="button" onClick={explore} className="btn-primary rounded-full px-8 py-3.5 text-base shadow-pop">
            Khám phá sự kiện
          </button>
          <Link to={createHref} className="rounded-full px-8 py-3.5 text-base font-semibold text-white ring-2 ring-inset ring-white/70 transition hover:bg-white/10">
            Tạo sự kiện
          </Link>
        </div>

        {next && (
          <Link
            to={`/su-kien/${next.id}`}
            className="absolute bottom-8 right-4 hidden w-72 animate-[floatY_6s_ease-in-out_infinite] items-center gap-3 rounded-2xl bg-white/95 p-3 shadow-xl shadow-black/30 backdrop-blur transition hover:-translate-y-1 lg:flex xl:right-0"
          >
            <img src={next.bannerUrl!} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-brand-600">Sắp diễn ra</p>
              <p className="truncate text-sm font-bold text-ink-900">{next.title}</p>
              <p className="truncate text-xs text-ink-500">{formatDateTime(next.startTime)}</p>
            </div>
          </Link>
        )}
      </div>
    </section>
  );
}
