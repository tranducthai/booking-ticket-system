import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";

interface Crumb {
  label: string;
  to?: string;
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
    isActive ? "text-brand-600" : "text-ink-700 hover:bg-ink-50 hover:text-ink-900"
  }`;

/**
 * Shared shell of the customer's account pages (Vé của tôi, thẻ thành viên,
 * đơn hàng, yêu thích, hồ sơ) — breadcrumb, a left menu with the account's name, and the
 * page title. Ticketbox's "my-tickets" layout.
 */
export function AccountLayout({ title, crumbs, children }: { title: string; crumbs: Crumb[]; children: ReactNode }) {
  const { user, role } = useAuth();
  const initial = (user?.fullName ?? user?.email ?? "?").trim().charAt(0).toUpperCase();

  return (
    <div className="container-page py-8">
      <nav className="mb-6 flex flex-wrap items-center gap-1.5 text-xs text-ink-400">
        <Link to="/" className="hover:text-ink-700">
          Trang chủ
        </Link>
        {crumbs.map((c) => (
          <span key={c.label} className="flex items-center gap-1.5">
            <span>›</span>
            {c.to ? (
              <Link to={c.to} className="hover:text-ink-700">
                {c.label}
              </Link>
            ) : (
              <span className="font-semibold text-ink-700">{c.label}</span>
            )}
          </span>
        ))}
      </nav>

      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-1">
          <Link to="/ho-so" className="mb-3 flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-ink-50">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700">{initial}</span>
            <span className="min-w-0">
              <span className="block text-xs text-ink-400">Tài khoản của</span>
              <span className="block truncate font-bold text-ink-900">{user?.fullName}</span>
            </span>
          </Link>

          <p className="flex items-center gap-2.5 px-3 pt-2 text-sm font-semibold text-ink-700">
            <UserIcon /> Cài đặt tài khoản
          </p>
          <div className="ml-7 space-y-0.5">
            <NavLink to="/ho-so" className={linkClass}>
              Thông tin tài khoản
            </NavLink>
          </div>
          <p className="flex items-center gap-2.5 px-3 pt-2 text-sm font-semibold text-ink-700">
            <TicketIcon /> Đơn hàng của tôi
          </p>
          <div className="ml-7 space-y-0.5">
            <NavLink to="/ve-cua-toi" className={linkClass}>
              Vé của tôi
            </NavLink>
            <NavLink to="/the-thanh-vien" className={linkClass}>
              Thẻ thành viên của tôi
            </NavLink>
            <NavLink to="/ban-lai-ve/cua-toi" className={linkClass}>
              Vé đang bán lại
            </NavLink>
            <NavLink to="/don-hang" end className={linkClass}>
              Lịch sử đơn hàng
            </NavLink>
          </div>
          <NavLink to="/yeu-thich" className={linkClass}>
            <HeartIcon /> Sự kiện yêu thích
          </NavLink>
          {(role === "ORGANIZER" || role === "ADMIN") && (
            <NavLink to={role === "ADMIN" ? "/quan-tri/su-kien" : "/kenh-to-chuc/su-kien"} className={linkClass}>
              <CalendarIcon /> Sự kiện của tôi
            </NavLink>
          )}
        </aside>

        <main className="min-w-0">
          <h1 className="border-b border-ink-100 pb-4 text-2xl">{title}</h1>
          <div className="mt-5">{children}</div>
        </main>
      </div>
    </div>
  );
}

const iconProps = { viewBox: "0 0 24 24", fill: "none", className: "h-4.5 w-4.5 shrink-0" } as const;

function UserIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function TicketIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 8a2 2 0 002-2h14a2 2 0 002 2v2a2 2 0 000 4v2a2 2 0 00-2 2H5a2 2 0 00-2-2v-2a2 2 0 000-4V8Z" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg {...iconProps}>
      <rect x="4" y="5" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 10h16M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
