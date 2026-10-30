import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { roleHomePath } from "../../lib/roleHome";
import { CategoryNavBar } from "./CategoryNavBar";
import { Footer } from "./Footer";
import { Header } from "./Header";

export function Layout() {
  // An organizer only has the organizer channel and an admin only the admin console — the storefront isn't theirs to browse.
  const { role } = useAuth();
  // The homepage shows the category bar itself, right under its banner (pages/HomePage.tsx).
  const { pathname } = useLocation();
  const isHome = pathname === "/";
  // Sign-in style pages are a focused two-column layout — no category bar above it.
  const isAuth = ["/login", "/register", "/forgot-password", "/reset-password", "/accept-invite"].includes(pathname);
  // ...except the public page of an artist or event, which they open from the console to see how it looks to buyers.
  const publicView = /^\/(artists|events)\/[^/]+$/.test(pathname);
  // The invite and login pages stay reachable while signed in: an invitee may open their link in a browser where an admin is logged in, then sign in as the new account.
  const accountPage = pathname === "/accept-invite" || pathname === "/login";
  if ((role === "ORGANIZER" || role === "ADMIN") && !publicView && !accountPage) return <Navigate to={roleHomePath(role)} replace />;
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
