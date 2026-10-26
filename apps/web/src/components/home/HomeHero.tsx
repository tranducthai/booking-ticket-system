import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { EventItem } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { formatDateTime } from "../../lib/format";

interface Slide {
  eyebrow: string;
  title: string;
  sub: string;
  primary: { label: string; to: string };
  secondary: { label: string; to: string };
}

/**
 * Homepage hero: a bright brand panel with a rounded right edge, two rotating
 * messages (for attendees / for organizers) and an in-house illustration —
 * stage, QR ticket, calendar — with the next real event floating on it.
 */
export function HomeHero({ events }: { events: EventItem[]; artistCount?: number }) {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [keyword, setKeyword] = useState("");
  const [slide, setSlide] = useState(0);
  const next = events.find((e) => e.bannerUrl);

  // Organizers go straight to their channel; everyone else to the organizer sign-up.
  const createHref = role === "ORGANIZER" || role === "ADMIN" ? "/kenh-to-chuc/su-kien/moi" : "/dang-ky?loai=ban-to-chuc";
  const slides: Slide[] = [
    {
      eyebrow: "Dành cho khán giả",
      title: "Vé sự kiện, nhanh gọn và minh bạch.",
      sub: "Tìm concert, sân khấu, workshop — chọn chỗ, thanh toán và nhận vé QR chống giả trong vài phút.",
      primary: { label: "Khám phá sự kiện", to: "/su-kien" },
      secondary: { label: "Vé bán lại", to: "/ban-lai-ve" },
    },
    {
      eyebrow: "Dành cho ban tổ chức",
      title: "Bán vé cho sự kiện của bạn — dễ dàng.",
      sub: "Tạo sự kiện, vẽ sơ đồ ghế, check-in bằng QR và theo dõi doanh thu — không phí khởi tạo.",
      primary: { label: "Tạo sự kiện", to: createHref },
      secondary: { label: "Tìm hiểu thêm", to: "/kenh-to-chuc" },
    },
  ];

  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % 2), 7000);
    return () => clearInterval(t);
  }, []);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    navigate(keyword.trim() ? `/su-kien?keyword=${encodeURIComponent(keyword.trim())}` : "/su-kien");
  }

  const s = slides[slide];
  return (
    <section className="relative overflow-hidden bg-white">
      {/* the brand panel — rounded on its right edge, like a stage curtain pulled back */}
      <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-br from-brand-500 to-brand-600 lg:w-[68%] lg:rounded-br-[220px] lg:rounded-tr-[220px]" />

      <div className="container-page relative grid min-h-[560px] items-center gap-8 py-14 lg:grid-cols-[1.1fr_1fr]">
        <div className="text-white">
          <div key={slide} className="animate-[heroIn_.5s_ease-out]">
            <p className="text-sm font-bold uppercase tracking-wider text-white/80">{s.eyebrow}</p>
            <h1 className="mt-3 max-w-xl text-4xl font-extrabold leading-[1.08] !text-white sm:text-[3.4rem]">{s.title}</h1>
            <p className="mt-4 max-w-lg text-base text-white/90">{s.sub}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to={s.primary.to} className="rounded-full bg-white px-8 py-3.5 text-base font-semibold text-ink-900 shadow-lg shadow-black/10 transition hover:-translate-y-0.5">
                {s.primary.label}
              </Link>
              <Link to={s.secondary.to} className="rounded-full px-8 py-3.5 text-base font-semibold text-white ring-2 ring-inset ring-white/80 transition hover:bg-white/10">
                {s.secondary.label}
              </Link>
            </div>
          </div>

          <form onSubmit={onSearch} className="mt-8 flex max-w-lg items-center rounded-full bg-white/15 p-1.5 ring-1 ring-inset ring-white/30 backdrop-blur">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Tìm sự kiện, nghệ sĩ, địa điểm..."
              className="min-w-0 flex-1 bg-transparent px-4 py-2 text-sm text-white outline-none placeholder:text-white/70"
            />
            <button type="submit" aria-label="Tìm kiếm" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-brand-600">
              <svg viewBox="0 0 24 24" fill="none" className="h-4.5 w-4.5">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.2" />
                <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </button>
          </form>

          <div className="mt-8 flex gap-2" role="tablist" aria-label="Chuyển nội dung">
            {slides.map((_, i) => (
              <button
                key={i}
                role="tab"
                aria-selected={i === slide}
                aria-label={`Nội dung ${i + 1}`}
                onClick={() => setSlide(i)}
                className={`h-2.5 rounded-full transition-all ${i === slide ? "w-7 bg-white" : "w-2.5 bg-white/50 hover:bg-white/70"}`}
              />
            ))}
          </div>
        </div>

        <div className="relative hidden lg:block">
          <HeroIllustration />
          {next && (
            <Link
              to={`/su-kien/${next.id}`}
              className="absolute bottom-6 left-0 flex w-72 animate-[floatY_6s_ease-in-out_infinite] items-center gap-3 rounded-2xl bg-white p-3 shadow-xl shadow-black/15 ring-1 ring-ink-100 transition hover:-translate-y-1"
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
