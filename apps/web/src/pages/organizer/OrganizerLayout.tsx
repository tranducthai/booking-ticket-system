import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { eventsApi } from "../../api/events";
import { ConsoleShell, type ConsoleNavSection } from "../../components/layout/ConsoleShell";

/**
 * Organizer channel — same back-office shell as the admin console. While an
 * event is open (/kenh-to-chuc/su-kien/:id/...), the sidebar grows a section
 * for managing that one event: overview & editing, attendees, check-in,
 * refund requests, its activity log.
 */
export function OrganizerLayout() {
  const { pathname: p } = useLocation();
  const eventId = /^\/kenh-to-chuc\/su-kien\/([^/]+)/.exec(p)?.[1];
  const currentEventId = eventId && eventId !== "moi" ? eventId : undefined;
  const { data: event } = useQuery({
    queryKey: ["event", currentEventId],
    queryFn: () => eventsApi.getById(currentEventId!),
    enabled: !!currentEventId,
  });

  const base = `/kenh-to-chuc/su-kien/${currentEventId}`;
  const sections: ConsoleNavSection[] = [
    { title: "Tổng quan", items: [{ to: "/kenh-to-chuc", label: "Bảng điều khiển", active: p === "/kenh-to-chuc" }] },
    {
      title: "Sự kiện",
      items: [
        { to: "/kenh-to-chuc/su-kien", label: "Sự kiện của tôi", active: p === "/kenh-to-chuc/su-kien" },
        { to: "/kenh-to-chuc/su-kien/moi", label: "Tạo sự kiện mới", active: p === "/kenh-to-chuc/su-kien/moi" },
      ],
    },
    ...(currentEventId
      ? [
          {
            title: "Sự kiện đang quản lý",
            subtitle: event?.title ?? "…",
            items: [
              { to: base, label: "Tổng quan & chỉnh sửa", active: p === base },
              { to: `${base}/khach-tham-du`, label: "Khách tham dự", active: p === `${base}/khach-tham-du` },
              { to: `${base}/check-in`, label: "Check-in", active: p === `${base}/check-in` },
              { to: `${base}/hoan-tien`, label: "Yêu cầu hoàn vé", active: p === `${base}/hoan-tien` },
              { to: `${base}/nhat-ky`, label: "Nhật ký sự kiện", active: p === `${base}/nhat-ky` },
            ],
          },
        ]
      : []),
    { title: "Tài khoản", items: [{ to: "/kenh-to-chuc/nhat-ky", label: "Nhật ký của tôi", active: p === "/kenh-to-chuc/nhat-ky" }] },
  ];

  return <ConsoleShell badge="Ban tổ chức" homeTo="/kenh-to-chuc" sections={sections} />;
}
