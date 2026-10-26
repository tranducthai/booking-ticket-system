import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { eventsApi } from "../../api/events";
import { ConsoleShell, type ConsoleNavSection } from "../../components/layout/ConsoleShell";

/** Admin console — its own shell (components/layout/ConsoleShell.tsx), not the storefront Layout. */
export function AdminLayout() {
  const { pathname: p } = useLocation();

  // Work waiting on an admin: events to approve + organizer cancellation requests.
  const { data: pending } = useQuery({ queryKey: ["admin", "pending-events", "count"], queryFn: () => eventsApi.pendingApproval({ limit: 1 }) });
  const { data: cancels } = useQuery({ queryKey: ["admin", "cancel-requests", "count"], queryFn: () => eventsApi.cancelRequests({ limit: 1 }) });
  const approvals = (pending?.total ?? 0) + (cancels?.total ?? 0);

  const sections: ConsoleNavSection[] = [
    { title: "Tổng quan", items: [{ to: "/quan-tri", label: "Bảng điều khiển", active: p === "/quan-tri" }] },
    {
      title: "Sự kiện",
      items: [
        { to: "/quan-tri/su-kien", label: "Tất cả sự kiện", active: p.startsWith("/quan-tri/su-kien") && p !== "/quan-tri/su-kien/moi" },
        { to: "/quan-tri/su-kien/moi", label: "Tạo sự kiện", active: p === "/quan-tri/su-kien/moi" },
        { to: "/quan-tri/duyet", label: "Duyệt & yêu cầu hủy", active: p === "/quan-tri/duyet", badge: approvals },
      ],
    },
    {
      title: "Đối tác & người dùng",
      items: [
        { to: "/quan-tri/doi-tac", label: "Đối tác (ban tổ chức)", active: p.startsWith("/quan-tri/doi-tac") },
        { to: "/quan-tri/nguoi-dung", label: "Người dùng", active: p.startsWith("/quan-tri/nguoi-dung") },
      ],
    },
    {
      title: "Nội dung",
      items: [
        { to: "/quan-tri/danh-muc", label: "Danh mục", active: p.startsWith("/quan-tri/danh-muc") },
        { to: "/quan-tri/nghe-si", label: "Nghệ sĩ", active: p.startsWith("/quan-tri/nghe-si") },
      ],
    },
    {
      title: "Vận hành",
      items: [
        { to: "/quan-tri/hoan-tien", label: "Yêu cầu hoàn tiền", active: p.startsWith("/quan-tri/hoan-tien") },
        { to: "/quan-tri/nhat-ky", label: "Nhật ký hệ thống", active: p.startsWith("/quan-tri/nhat-ky") },
      ],
    },
    { title: "", items: [{ to: "/ho-so", label: "Hồ sơ", active: false }] },
  ];

  return <ConsoleShell homeTo="/quan-tri" sections={sections} />;
}
