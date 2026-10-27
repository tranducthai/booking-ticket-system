import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { CategoryNavBar } from "./CategoryNavBar";
import { Footer } from "./Footer";
import { Header } from "./Header";

export function Layout() {
  // An organizer only has the organizer channel — the storefront isn't theirs to browse.
  const { role } = useAuth();
  // The homepage shows the category bar itself, right under its banner (pages/HomePage.tsx).
  const { pathname } = useLocation();
  const isHome = pathname === "/";
  // Sign-in style pages are a focused two-column layout — no category bar above it.
  const isAuth = ["/dang-nhap", "/dang-ky", "/quen-mat-khau", "/dat-lai-mat-khau"].includes(pathname);
  // ...except the public page of an artist or event, which they open from the console to see how it looks to buyers.
  const publicView = /^\/(nghe-si|su-kien)\/[^/]+$/.test(pathname);
  if (role === "ORGANIZER" && !publicView) return <Navigate to="/kenh-to-chuc" replace />;
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      {!isHome && !isAuth && <CategoryNavBar />}
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
