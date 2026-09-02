import { NavLink, Outlet } from "react-router-dom";
import clsx from "clsx";

const NAV = [
  { to: "/kenh-to-chuc", label: "Tổng quan", end: true },
  { to: "/kenh-to-chuc/su-kien/moi", label: "Tạo sự kiện mới", end: true },
];

export function OrganizerLayout() {
  return (
    <div className="container-page py-8">
      <h1 className="text-2xl">Kênh tổ chức</h1>
      <div className="mt-6 grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="flex gap-2 overflow-x-auto lg:flex-col">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  "shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors",
                  isActive ? "bg-brand-500 text-white" : "text-ink-600 hover:bg-ink-100",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
