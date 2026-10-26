import { Outlet, useLocation } from "react-router-dom";
import { CategoryNavBar } from "./CategoryNavBar";
import { Footer } from "./Footer";
import { Header } from "./Header";

export function Layout() {
  // The homepage shows the category bar itself, right under its banner (pages/HomePage.tsx).
  const { pathname } = useLocation();
  const isHome = pathname === "/";
  // Sign-in style pages are a focused two-column layout — no category bar above it.
  const isAuth = ["/dang-nhap", "/dang-ky", "/quen-mat-khau", "/dat-lai-mat-khau"].includes(pathname);
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
