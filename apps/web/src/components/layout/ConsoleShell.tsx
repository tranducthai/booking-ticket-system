import clsx from "clsx";
import { useState, type ReactNode } from "react";
import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useProfile } from "../../auth/useProfile";
import { NotificationBell } from "../notifications/NotificationBell";

export interface ConsoleNavItem {
  to: string;
  label: string;
  active: boolean;
  badge?: number;
}

export interface ConsoleNavSection {
  /** Small heading above the group; leave empty to show the items without one. */
  title: string;
  /** Optional line under the section title — e.g. the event currently being managed. */
  subtitle?: string;
  items: ConsoleNavItem[];
}

/**
 * Shared shell for the back-office areas (admin console, organizer channel):
 * a dark sidebar with grouped navigation and a slim top bar — none of the
 * storefront chrome (category bar, event search, footer).
 */
export function ConsoleShell({ homeTo, sections }: { homeTo: string; sections: ConsoleNavSection[] }) {
  const { logout } = useAuth();
  const profile = useProfile();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-ink-50">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-ink-900 text-white lg:flex">
        <Link to={homeTo} className="flex h-16 shrink-0 items-center gap-2 px-6">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-black">T</span>
          <span className="text-lg font-extrabold">
            Event<span className="text-brand-400">Pass</span>
          </span>
        </Link>
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {sections.map((section, i) => (
            <div key={`${i}-${section.title}`}>
              {section.title && <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-white/40">{section.title}</p>}
              {section.subtitle && <p className="truncate px-3 pt-0.5 text-sm font-semibold text-white">{section.subtitle}</p>}
              <div className={`${section.title || section.subtitle ? "mt-1.5 " : ""}space-y-0.5`}>
                {section.items.map((item) => (
                  <NavRow key={item.to} item={item} />
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-ink-100 bg-white px-4 sm:px-6">
          <Link to={homeTo} className="font-extrabold text-ink-900 lg:hidden">
            Event<span className="text-brand-500">Pass</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
                className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 hover:bg-ink-100"
              >
                {profile.avatarUrl ? (
                  <img src={profile.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-800 text-sm font-bold text-white">
                    {profile.fullName[0]?.toUpperCase() ?? "?"}
                  </span>
                )}
                <span className="hidden max-w-[22rem] truncate text-sm font-semibold text-ink-800 sm:block">{profile.fullName}</span>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-12 w-48 overflow-hidden rounded-xl border border-ink-100 bg-white py-1 shadow-card"
                  // Keep focus on the trigger while pressing an item: its onBlur would otherwise unmount the menu mid-click
                  // (a press held >150 ms lost the click). Any click inside closes it.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setMenuOpen(false)}
                >
                  <button onClick={logout} className="block w-full px-4 py-2.5 text-left text-sm font-semibold text-red-600 hover:bg-red-50">
                    Đăng xuất
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Below lg the sidebar collapses into a scrollable strip. */}
        <nav className="flex gap-1 overflow-x-auto border-b border-ink-100 bg-white px-4 py-2 lg:hidden">
          {sections.flatMap((s) => s.items).map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={clsx("shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold", item.active ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100")}
            >
              {item.label}
              {item.badge ? ` (${item.badge})` : ""}
            </Link>
          ))}
        </nav>

        <main className="flex-1 px-4 py-6 sm:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavRow({ item }: { item: ConsoleNavItem }): ReactNode {
  return (
    <Link
      to={item.to}
      className={clsx(
        "flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
        item.active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white",
      )}
    >
      {item.label}
      {!!item.badge && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-bold text-white">{item.badge}</span>}
    </Link>
  );
}
