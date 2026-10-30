import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { artistsApi } from "../../api/artists";
import { eventsApi } from "../../api/events";
import { ConsoleShell, type ConsoleNavSection } from "../../components/layout/ConsoleShell";

/** Admin console — its own shell (components/layout/ConsoleShell.tsx), not the storefront Layout. */
export function AdminLayout() {
  const { pathname: p } = useLocation();

  // Work waiting on an admin: events to approve + organizer cancellation requests.
  const { data: pending } = useQuery({ queryKey: ["admin", "pending-events", "count"], queryFn: () => eventsApi.pendingApproval({ limit: 1 }) });
  const { data: cancels } = useQuery({ queryKey: ["admin", "cancel-requests", "count"], queryFn: () => eventsApi.cancelRequests({ limit: 1 }) });
  const { data: pendingArtists } = useQuery({ queryKey: ["artists", "pending", "count"], queryFn: () => artistsApi.pending() });
  const approvals = (pending?.total ?? 0) + (cancels?.total ?? 0);

  const sections: ConsoleNavSection[] = [
    { title: "", items: [{ to: "/admin", label: "Thống kê", active: p === "/admin" }] },
    {
      title: "Sự kiện",
      items: [
        { to: "/admin/events", label: "Tất cả sự kiện", active: p.startsWith("/admin/events") && p !== "/admin/events/new" },
        { to: "/admin/events/new", label: "Tạo sự kiện", active: p === "/admin/events/new" },
        { to: "/admin/approvals", label: "Duyệt & yêu cầu hủy", active: p === "/admin/approvals", badge: approvals },
      ],
    },
    {
      title: "Đối tác & người dùng",
      items: [
        { to: "/admin/partners", label: "Đối tác (ban tổ chức)", active: p.startsWith("/admin/partners") },
        { to: "/admin/users", label: "Người dùng", active: p.startsWith("/admin/users") },
      ],
    },
    {
      title: "Nội dung",
      items: [
        { to: "/admin/categories", label: "Danh mục", active: p.startsWith("/admin/categories") },
        { to: "/admin/artists", label: "Nghệ sĩ", active: p.startsWith("/admin/artists"), badge: pendingArtists?.total ?? 0 },
      ],
    },
    {
      title: "Vận hành",
      items: [
        { to: "/admin/refunds", label: "Yêu cầu hoàn tiền", active: p.startsWith("/admin/refunds") },
        { to: "/admin/audit-log", label: "Nhật ký hệ thống", active: p.startsWith("/admin/audit-log") },
      ],
    },
    { title: "", items: [{ to: "/profile", label: "Hồ sơ", active: false }] },
  ];

  return <ConsoleShell homeTo="/admin" sections={sections} />;
}
