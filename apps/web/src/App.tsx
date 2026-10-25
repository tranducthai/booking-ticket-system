import { Route, Routes, Navigate } from "react-router-dom";
import { RequireAuth } from "./auth/RequireAuth";
import { Layout } from "./components/layout/Layout";
import { AdminCategoriesPage } from "./pages/admin/AdminCategoriesPage";
import { AdminArtistsPage } from "./pages/admin/AdminArtistsPage";
import { AdminEventsApprovalPage } from "./pages/admin/AdminEventsApprovalPage";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { AdminRefundsPage } from "./pages/admin/AdminRefundsPage";
import { AdminReportsPage } from "./pages/admin/AdminReportsPage";
import { AdminUsersPage } from "./pages/admin/AdminUsersPage";
import { AdminEventsPage } from "./pages/admin/AdminEventsPage";
import { AdminPartnersPage } from "./pages/admin/AdminPartnersPage";
import { ArtistDetailPage } from "./pages/ArtistDetailPage";
import { ArtistsPage } from "./pages/ArtistsPage";
import { CheckoutPage } from "./pages/CheckoutPage";
import { EventDetailPage } from "./pages/EventDetailPage";
import { EventsPage } from "./pages/EventsPage";
import { FavoritesPage } from "./pages/FavoritesPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { OAuthCallbackPage } from "./pages/OAuthCallbackPage";
import { OrderDetailPage } from "./pages/OrderDetailPage";
import { OrdersPage } from "./pages/OrdersPage";
import { OrganizerAttendeesPage } from "./pages/organizer/OrganizerAttendeesPage";
import { OrganizerCheckinPage } from "./pages/organizer/OrganizerCheckinPage";
import { OrganizerDashboardPage } from "./pages/organizer/OrganizerDashboardPage";
import { OrganizerEventDetailPage } from "./pages/organizer/OrganizerEventDetailPage";
import { EventWizardPage } from "./pages/organizer/EventWizardPage";
import { OrganizerEventsPage } from "./pages/organizer/OrganizerEventsPage";
import { OrganizerLayout } from "./pages/organizer/OrganizerLayout";
import { OrganizerRefundsPage } from "./pages/organizer/OrganizerRefundsPage";
import { OrganizerEventActivityPage } from "./pages/organizer/OrganizerEventActivityPage";
import { AdminAuditLogPage } from "./pages/admin/AdminAuditLogPage";
import { ActivityPage } from "./pages/ActivityPage";
import { ProfilePage } from "./pages/ProfilePage";
import { MembershipsPage } from "./pages/MembershipsPage";
import { ResalePage } from "./pages/ResalePage";
import { MyResalePage } from "./pages/MyResalePage";
import { RegisterPage } from "./pages/RegisterPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { TicketDetailPage } from "./pages/TicketDetailPage";
import { TicketsPage } from "./pages/TicketsPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="su-kien" element={<EventsPage />} />
        <Route path="su-kien/:id" element={<EventDetailPage />} />
        <Route path="nghe-si" element={<ArtistsPage />} />
        <Route path="nghe-si/:id" element={<ArtistDetailPage />} />
        <Route path="ban-lai-ve" element={<ResalePage />} />
        <Route path="dang-nhap" element={<LoginPage />} />
        <Route path="dang-ky" element={<RegisterPage />} />
        <Route path="quen-mat-khau" element={<ForgotPasswordPage />} />
        <Route path="dat-lai-mat-khau" element={<ResetPasswordPage />} />
        <Route path="oauth/callback" element={<OAuthCallbackPage />} />

        <Route path="thanh-toan/:orderId" element={<RequireAuth><CheckoutPage /></RequireAuth>} />
        <Route path="don-hang" element={<RequireAuth><OrdersPage /></RequireAuth>} />
        <Route path="don-hang/:id" element={<RequireAuth><OrderDetailPage /></RequireAuth>} />
        <Route path="ve-cua-toi" element={<RequireAuth><TicketsPage /></RequireAuth>} />
        <Route path="ve-cua-toi/:id" element={<RequireAuth><TicketDetailPage /></RequireAuth>} />
        <Route path="yeu-thich" element={<RequireAuth><FavoritesPage /></RequireAuth>} />
        <Route path="ho-so" element={<RequireAuth><ProfilePage /></RequireAuth>} />
        <Route path="the-thanh-vien" element={<RequireAuth><MembershipsPage /></RequireAuth>} />
        <Route path="ban-lai-ve/cua-toi" element={<RequireAuth><MyResalePage /></RequireAuth>} />
        <Route path="hoat-dong" element={<RequireAuth><ActivityPage /></RequireAuth>} />

        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {/* Organizer channel — own back-office shell (ConsoleShell), like the admin console. */}
      <Route
        path="kenh-to-chuc"
        element={
          <RequireAuth roles={["ORGANIZER"]}>
            <OrganizerLayout />
          </RequireAuth>
        }
      >
        <Route index element={<OrganizerDashboardPage />} />
        <Route path="su-kien" element={<OrganizerEventsPage />} />
        <Route path="su-kien/moi" element={<EventWizardPage />} />
        <Route path="su-kien/:id/thiet-lap" element={<EventWizardPage />} />
        <Route path="su-kien/:id" element={<OrganizerEventDetailPage />} />
        <Route path="su-kien/:id/khach-tham-du" element={<OrganizerAttendeesPage />} />
        <Route path="su-kien/:id/check-in" element={<OrganizerCheckinPage />} />
        <Route path="su-kien/:id/hoan-tien" element={<OrganizerRefundsPage />} />
        <Route path="su-kien/:id/nhat-ky" element={<OrganizerEventActivityPage />} />
        <Route path="nhat-ky" element={<ActivityPage />} />
      </Route>

      {/* The admin console has its own shell (AdminLayout) — no storefront header, category bar or footer. */}
      <Route
        path="quan-tri"
        element={
          <RequireAuth roles={["ADMIN"]}>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<AdminReportsPage />} />
        <Route path="su-kien" element={<AdminEventsPage />} />
        <Route path="su-kien/moi" element={<EventWizardPage asAdmin />} />
        <Route path="su-kien/:id/thiet-lap" element={<EventWizardPage asAdmin />} />
        <Route path="su-kien/:id" element={<OrganizerEventDetailPage asAdmin />} />
        <Route path="duyet" element={<AdminEventsApprovalPage />} />
        <Route path="doi-tac" element={<AdminPartnersPage />} />
        <Route path="nguoi-dung" element={<AdminUsersPage />} />
        <Route path="danh-muc" element={<AdminCategoriesPage />} />
        <Route path="nghe-si" element={<AdminArtistsPage />} />
        <Route path="hoan-tien" element={<AdminRefundsPage />} />
        <Route path="nhat-ky" element={<AdminAuditLogPage />} />
        <Route path="bao-cao" element={<Navigate to="/quan-tri" replace />} />
      </Route>
    </Routes>
  );
}
