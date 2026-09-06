import { Route, Routes } from "react-router-dom";
import { RequireAuth } from "./auth/RequireAuth";
import { Layout } from "./components/layout/Layout";
import { AdminCategoriesPage } from "./pages/admin/AdminCategoriesPage";
import { AdminEventsApprovalPage } from "./pages/admin/AdminEventsApprovalPage";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { AdminRefundsPage } from "./pages/admin/AdminRefundsPage";
import { AdminReportsPage } from "./pages/admin/AdminReportsPage";
import { AdminUsersPage } from "./pages/admin/AdminUsersPage";
import { CheckoutPage } from "./pages/CheckoutPage";
import { EventDetailPage } from "./pages/EventDetailPage";
import { EventsPage } from "./pages/EventsPage";
import { FavoritesPage } from "./pages/FavoritesPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { OrderDetailPage } from "./pages/OrderDetailPage";
import { OrdersPage } from "./pages/OrdersPage";
import { OrganizerAttendeesPage } from "./pages/organizer/OrganizerAttendeesPage";
import { OrganizerCheckinPage } from "./pages/organizer/OrganizerCheckinPage";
import { OrganizerDashboardPage } from "./pages/organizer/OrganizerDashboardPage";
import { OrganizerEventDetailPage } from "./pages/organizer/OrganizerEventDetailPage";
import { OrganizerEventFormPage } from "./pages/organizer/OrganizerEventFormPage";
import { OrganizerLayout } from "./pages/organizer/OrganizerLayout";
import { ProfilePage } from "./pages/ProfilePage";
import { RegisterPage } from "./pages/RegisterPage";
import { TicketDetailPage } from "./pages/TicketDetailPage";
import { TicketsPage } from "./pages/TicketsPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="su-kien" element={<EventsPage />} />
        <Route path="su-kien/:id" element={<EventDetailPage />} />
        <Route path="dang-nhap" element={<LoginPage />} />
        <Route path="dang-ky" element={<RegisterPage />} />

        <Route path="thanh-toan/:orderId" element={<RequireAuth><CheckoutPage /></RequireAuth>} />
        <Route path="don-hang" element={<RequireAuth><OrdersPage /></RequireAuth>} />
        <Route path="don-hang/:id" element={<RequireAuth><OrderDetailPage /></RequireAuth>} />
        <Route path="ve-cua-toi" element={<RequireAuth><TicketsPage /></RequireAuth>} />
        <Route path="ve-cua-toi/:id" element={<RequireAuth><TicketDetailPage /></RequireAuth>} />
        <Route path="yeu-thich" element={<RequireAuth><FavoritesPage /></RequireAuth>} />
        <Route path="ho-so" element={<RequireAuth><ProfilePage /></RequireAuth>} />

        <Route
          path="kenh-to-chuc"
          element={
            <RequireAuth roles={["ORGANIZER"]}>
              <OrganizerLayout />
            </RequireAuth>
          }
        >
          <Route index element={<OrganizerDashboardPage />} />
          <Route path="su-kien/moi" element={<OrganizerEventFormPage />} />
          <Route path="su-kien/:id" element={<OrganizerEventDetailPage />} />
          <Route path="su-kien/:id/khach-tham-du" element={<OrganizerAttendeesPage />} />
          <Route path="su-kien/:id/check-in" element={<OrganizerCheckinPage />} />
        </Route>

        <Route
          path="quan-tri"
          element={
            <RequireAuth roles={["ADMIN"]}>
              <AdminLayout />
            </RequireAuth>
          }
        >
          <Route index element={<AdminEventsApprovalPage />} />
          <Route path="nguoi-dung" element={<AdminUsersPage />} />
          <Route path="danh-muc" element={<AdminCategoriesPage />} />
          <Route path="hoan-tien" element={<AdminRefundsPage />} />
          <Route path="bao-cao" element={<AdminReportsPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
