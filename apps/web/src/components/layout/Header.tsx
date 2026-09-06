import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";

export function Header() {
  const { isAuthenticated, user, role, logout } = useAuth();
  const [keyword, setKeyword] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  function onSearch(e: FormEvent) {
    e.preventDefault();
    navigate(keyword.trim() ? `/su-kien?keyword=${encodeURIComponent(keyword.trim())}` : "/su-kien");
  }

  return (
    <header className="sticky top-0 z-30 border-b border-ink-100 bg-white/95 backdrop-blur">
      <div className="container-page flex h-16 items-center gap-4">
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white shadow-pop">
            <svg viewBox="0 0 24 24" fill="none" className="h-4.5 w-4.5">
              <path
                d="M4 9a2.5 2.5 0 000 5v3a1.5 1.5 0 001.5 1.5h13A1.5 1.5 0 0020 16v-3a2.5 2.5 0 000-5V5.5A1.5 1.5 0 0018.5 4h-13A1.5 1.5 0 004 5.5V9Z"
                fill="currentColor"
              />
              <path d="M11.5 6v1.5M11.5 16.5V18M11.5 10.75v2.5" stroke="#E8462A" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </span>
          <span className="text-lg font-extrabold text-ink-900">
            Ticket<span className="text-brand-500">box</span>
          </span>
        </Link>

        <form onSubmit={onSearch} className="hidden flex-1 max-w-xl sm:block">
          <div className="relative">
            <svg viewBox="0 0 24 24" fill="none" className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-ink-400">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
              <path d="m20 20-3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Tìm sự kiện, nghệ sĩ, địa điểm..."
              className="input pl-10"
            />
          </div>
        </form>

        <nav className="ml-auto flex items-center gap-2">
          <Link to="/su-kien" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-ink-600 hover:bg-ink-100 md:block">
            Khám phá
          </Link>

          {role === "ORGANIZER" && (
            <Link to="/kenh-to-chuc" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-ink-600 hover:bg-ink-100 md:block">
              Kênh tổ chức
            </Link>
          )}
          {role === "ADMIN" && (
            <Link to="/quan-tri" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-ink-600 hover:bg-ink-100 md:block">
              Quản trị
            </Link>
          )}

          {isAuthenticated ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
                className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 hover:bg-ink-100"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-800 text-sm font-bold text-white">
                  {user?.fullName?.[0]?.toUpperCase() ?? "U"}
                </span>
                <span className="hidden max-w-[10rem] truncate text-sm font-semibold text-ink-800 sm:block">{user?.fullName}</span>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-12 w-56 overflow-hidden rounded-xl border border-ink-100 bg-white py-1 shadow-card">
                  <Link to="/don-hang" className="block px-4 py-2.5 text-sm text-ink-700 hover:bg-ink-50">
                    Đơn hàng của tôi
                  </Link>
                  <Link to="/ve-cua-toi" className="block px-4 py-2.5 text-sm text-ink-700 hover:bg-ink-50">
                    Vé của tôi
                  </Link>
                  <Link to="/yeu-thich" className="block px-4 py-2.5 text-sm text-ink-700 hover:bg-ink-50">
                    Sự kiện yêu thích
                  </Link>
                  <Link to="/ho-so" className="block px-4 py-2.5 text-sm text-ink-700 hover:bg-ink-50">
                    Hồ sơ
                  </Link>
                  {role === "ORGANIZER" && (
                    <Link to="/kenh-to-chuc" className="block px-4 py-2.5 text-sm text-ink-700 hover:bg-ink-50 md:hidden">
                      Kênh tổ chức
                    </Link>
                  )}
                  {role === "ADMIN" && (
                    <Link to="/quan-tri" className="block px-4 py-2.5 text-sm text-ink-700 hover:bg-ink-50 md:hidden">
                      Quản trị
                    </Link>
                  )}
                  <button onClick={logout} className="block w-full px-4 py-2.5 text-left text-sm font-semibold text-red-600 hover:bg-red-50">
                    Đăng xuất
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/dang-nhap" className="btn-ghost">
                Đăng nhập
              </Link>
              <Link to="/dang-ky" className="btn-primary">
                Đăng ký
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
