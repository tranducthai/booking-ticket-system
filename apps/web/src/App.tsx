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
import { AcceptInvitePage } from "./pages/AcceptInvitePage";
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
import { OrganizerArtistsPage } from "./pages/organizer/OrganizerArtistsPage";
import { ResaleDetailPage } from "./pages/ResaleDetailPage";
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
        <Route path="events" element={<EventsPage />} />
        <Route path="events/:id" element={<EventDetailPage />} />
        <Route path="artists" element={<ArtistsPage />} />
        <Route path="artists/:id" element={<ArtistDetailPage />} />
        <Route path="resale" element={<ResalePage />} />
        <Route path="resale/:id" element={<ResaleDetailPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route path="accept-invite" element={<AcceptInvitePage />} />
        <Route path="oauth/callback" element={<OAuthCallbackPage />} />

        <Route path="checkout/:orderId" element={<RequireAuth><CheckoutPage /></RequireAuth>} />
        <Route path="orders" element={<RequireAuth><OrdersPage /></RequireAuth>} />
        <Route path="orders/:id" element={<RequireAuth><OrderDetailPage /></RequireAuth>} />
        <Route path="my-tickets" element={<RequireAuth><TicketsPage /></RequireAuth>} />
        <Route path="my-tickets/:id" element={<RequireAuth><TicketDetailPage /></RequireAuth>} />
        <Route path="favorites" element={<RequireAuth><FavoritesPage /></RequireAuth>} />
        <Route path="profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
        <Route path="memberships" element={<RequireAuth><MembershipsPage /></RequireAuth>} />
        <Route path="resale/mine" element={<RequireAuth><MyResalePage /></RequireAuth>} />
        <Route path="activity" element={<RequireAuth><ActivityPage /></RequireAuth>} />

        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {/* Organizer channel — own back-office shell (ConsoleShell), like the admin console. */}
      <Route
        path="organizer"
        element={
          <RequireAuth roles={["ORGANIZER"]}>
            <OrganizerLayout />
          </RequireAuth>
        }
      >
        <Route index element={<OrganizerDashboardPage />} />
        <Route path="events" element={<OrganizerEventsPage />} />
        <Route path="events/new" element={<EventWizardPage />} />
        <Route path="events/:id/setup" element={<EventWizardPage />} />
        <Route path="events/:id" element={<OrganizerEventDetailPage />} />
        <Route path="events/:id/attendees" element={<OrganizerAttendeesPage />} />
        <Route path="events/:id/check-in" element={<OrganizerCheckinPage />} />
        <Route path="events/:id/refunds" element={<OrganizerRefundsPage />} />
        <Route path="events/:id/activity" element={<OrganizerEventActivityPage />} />
        <Route path="artists" element={<OrganizerArtistsPage />} />
        <Route path="profile" element={<ProfilePage embedded />} />
        <Route path="activity" element={<ActivityPage />} />
      </Route>

      {/* The admin console has its own shell (AdminLayout) — no storefront header, category bar or footer. */}
      <Route
        path="admin"
        element={
          <RequireAuth roles={["ADMIN"]}>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<AdminReportsPage />} />
        <Route path="events" element={<AdminEventsPage />} />
        <Route path="events/new" element={<EventWizardPage asAdmin />} />
        <Route path="events/:id/setup" element={<EventWizardPage asAdmin />} />
        <Route path="events/:id" element={<OrganizerEventDetailPage asAdmin />} />
        <Route path="approvals" element={<AdminEventsApprovalPage />} />
        <Route path="partners" element={<AdminPartnersPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="categories" element={<AdminCategoriesPage />} />
        <Route path="artists" element={<AdminArtistsPage />} />
        <Route path="refunds" element={<AdminRefundsPage />} />
        <Route path="audit-log" element={<AdminAuditLogPage />} />
        <Route path="reports" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}
