import { Link } from "react-router-dom";
import type { EventItem } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";

/** id of the homepage section "Khám phá sự kiện" scrolls to (pages/HomePage.tsx). */
export const HOME_EVENTS_ANCHOR = "su-kien-sap-dien-ra";

/**
 * Homepage hero: a bright brand panel with a rounded right edge, one message
 * and two choices — explore (scrolls down to the events on this page) or
 * create an event (organizer sign-up) — beside an in-house illustration.
 */
export function HomeHero(_props: { events?: EventItem[]; artistCount?: number }) {
  const { role } = useAuth();
  // Already an organizer/admin: straight to the event form instead of signing up again.
  const createHref = role === "ORGANIZER" || role === "ADMIN" ? "/kenh-to-chuc/su-kien/moi" : "/dang-ky?loai=ban-to-chuc";

  const explore = () => document.getElementById(HOME_EVENTS_ANCHOR)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <section className="relative overflow-hidden bg-white">
      {/* the brand panel — rounded on its right edge, like a stage curtain pulled back */}
      <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-br from-brand-500 to-brand-600 lg:w-[68%] lg:rounded-br-[220px] lg:rounded-tr-[220px]" />

      <div className="container-page relative grid min-h-[540px] items-center gap-8 py-14 lg:grid-cols-[1.1fr_1fr]">
        <div className="text-white">
          <p className="text-sm font-bold uppercase tracking-wider text-white/80">Nền tảng vé sự kiện</p>
          <h1 className="mt-3 max-w-xl text-4xl font-extrabold leading-[1.08] !text-white sm:text-[3.4rem]">Mua vé sự kiện nhanh chóng.</h1>
          <p className="mt-4 max-w-lg text-base text-white/90">Tìm sự kiện, mua vé, có vé điện tử ngay.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={explore}
              className="rounded-full bg-white px-8 py-3.5 text-base font-semibold text-ink-900 shadow-lg shadow-black/10 transition hover:-translate-y-0.5"
            >
              Khám phá sự kiện
            </button>
            <Link to={createHref} className="rounded-full px-8 py-3.5 text-base font-semibold text-white ring-2 ring-inset ring-white/80 transition hover:bg-white/10">
              Tạo sự kiện
            </Link>
          </div>
        </div>

        <div className="relative hidden lg:block">
          <HeroIllustration />
        </div>
      </div>
    </section>
  );
}

/** In-house flat illustration: a stage under spotlights inside a circle, a QR ticket, a calendar and a create/buy toggle card, with clouds. */
function HeroIllustration() {
  return (
    <svg viewBox="0 0 560 520" className="mx-auto w-full max-w-[560px] drop-shadow-sm" role="img" aria-label="Minh hoạ: sân khấu, vé QR và lịch sự kiện">
      {/* clouds */}
      <g fill="#fff">
        <Cloud x={20} y={90} s={1} />
        <Cloud x={470} y={150} s={0.7} opacity={0.9} />
        <Cloud x={40} y={420} s={0.8} />
      </g>

      {/* big circle "world" */}
      <circle cx="300" cy="270" r="200" fill="#fff" />
      <circle cx="300" cy="270" r="186" fill="#fff1ec" />
      <clipPath id="hero-circle">
        <circle cx="300" cy="270" r="186" />
      </clipPath>
      <g clipPath="url(#hero-circle)">
        {/* spotlights */}
        <polygon points="200,80 230,80 330,330 250,330" fill="#f5b21b" opacity="0.28" />
        <polygon points="390,80 420,80 360,330 280,330" fill="#f5b21b" opacity="0.22" />
        {/* stage */}
        <rect x="150" y="300" width="300" height="34" rx="6" fill="#1e1b2e" />
        <rect x="150" y="296" width="300" height="10" rx="4" fill="#e8462a" />
        {/* performer */}
        <circle cx="300" cy="238" r="14" fill="#1e1b2e" />
        <path d="M282 296 L288 256 Q300 248 312 256 L318 296 Z" fill="#1e1b2e" />
        <path d="M312 262 L336 240" stroke="#1e1b2e" strokeWidth="7" strokeLinecap="round" />
        <circle cx="338" cy="236" r="5" fill="#e8462a" />
        {/* crowd */}
        <rect x="110" y="334" width="380" height="140" fill="#fde2d8" />
        {[140, 180, 220, 260, 300, 340, 380, 420, 460].map((x, i) => (
          <g key={x} fill={i % 2 ? "#e8462a" : "#1e1b2e"} opacity={0.85}>
            <circle cx={x} cy={372 + (i % 3) * 6} r="13" />
            <rect x={x - 16} y={384 + (i % 3) * 6} width="32" height="60" rx="14" />
          </g>
        ))}
        {[160, 260, 400].map((x) => (
          <path key={x} d={`M${x} 360 l-8 -26`} stroke="#1e1b2e" strokeWidth="6" strokeLinecap="round" opacity="0.85" />
        ))}
      </g>

      {/* QR ticket, tilted, overlapping the circle */}
      <g transform="translate(410 300) rotate(12)">
        <path d="M0 0 h120 a12 12 0 0 0 0 24 v40 a12 12 0 0 0 0 24 v40 h-120 v-40 a12 12 0 0 0 0 -24 v-40 a12 12 0 0 0 0 -24 z" fill="#fff" stroke="#1e1b2e" strokeWidth="3" />
        <text x="14" y="26" fontSize="13" fontWeight="800" fill="#e8462a" fontFamily="inherit">VÉ ĐIỆN TỬ</text>
        <g fill="#1e1b2e">
          {[0, 1, 2, 3, 4].flatMap((r) => [0, 1, 2, 3, 4].map((c) => ((r * 7 + c * 3) % 4 !== 0 ? <rect key={`${r}${c}`} x={22 + c * 13} y={42 + r * 13} width="11" height="11" rx="1.5" /> : null)))}
        </g>
        <line x1="14" y1="118" x2="96" y2="118" stroke="#1e1b2e" strokeWidth="3" strokeDasharray="5 5" />
      </g>

      {/* calendar */}
      <g transform="translate(150 40) rotate(-8)">
        <rect width="96" height="84" rx="10" fill="#fff" stroke="#1e1b2e" strokeWidth="3" />
        <rect width="96" height="22" rx="10" fill="#1e1b2e" />
        {[0, 1, 2].flatMap((r) => [0, 1, 2, 3].map((c) => <rect key={`${r}${c}`} x={10 + c * 20} y={32 + r * 16} width="14" height="10" rx="2" fill={r === 1 && c === 2 ? "#e8462a" : "#fde2d8"} />))}
      </g>

      {/* create / buy toggle card */}
      <g transform="translate(330 20) rotate(9)">
        <rect width="178" height="70" rx="10" fill="#fff" stroke="#1e1b2e" strokeWidth="3" />
        <rect x="6" y="6" width="166" height="28" rx="6" fill="#e8462a" />
        <circle cx="22" cy="20" r="6" fill="#fff" />
        <text x="36" y="25" fontSize="14" fontWeight="700" fill="#fff" fontFamily="inherit">Tạo sự kiện</text>
        <circle cx="22" cy="52" r="6" fill="none" stroke="#1e1b2e" strokeWidth="2.5" />
        <text x="36" y="57" fontSize="14" fontWeight="700" fill="#1e1b2e" fontFamily="inherit">Mua vé ♥</text>
      </g>
    </svg>
  );
}

function Cloud({ x, y, s, opacity = 1 }: { x: number; y: number; s: number; opacity?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} opacity={opacity}>
      <ellipse cx="40" cy="30" rx="40" ry="22" />
      <circle cx="30" cy="20" r="18" />
      <circle cx="55" cy="14" r="22" />
    </g>
  );
}
