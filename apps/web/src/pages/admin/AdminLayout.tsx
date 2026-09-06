import clsx from "clsx";
import { NavLink, Outlet } from "react-router-dom";

const NAV = [
  { to: "/quan-tri", label: "Duyệt sự kiện", end: true },
  { to: "/quan-tri/nguoi-dung", label: "Người dùng" },
  { to: "/quan-tri/danh-muc", label: "Danh mục" },
  { to: "/quan-tri/nghe-si", label: "Nghệ sĩ" },
  { to: "/quan-tri/hoan-tien", label: "Yêu cầu hoàn tiền" },
  { to: "/quan-tri/bao-cao", label: "Báo cáo thống kê" },
];

export function AdminLayout() {
  return (
    <div className="container-page py-8">
      <h1 className="text-2xl">Quản trị hệ thống</h1>
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
                  isActive ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100",
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
