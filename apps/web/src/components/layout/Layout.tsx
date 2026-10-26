import { Outlet, useLocation } from "react-router-dom";
import { CategoryNavBar } from "./CategoryNavBar";
import { Footer } from "./Footer";
import { Header } from "./Header";

export function Layout() {
  // The homepage shows the category bar itself, right under its banner (pages/HomePage.tsx).
  const isHome = useLocation().pathname === "/";
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      {!isHome && <CategoryNavBar />}
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
