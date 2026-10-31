import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { eventsApi } from "../../api/events";
import { ConsoleShell, type ConsoleNavSection } from "../../components/layout/ConsoleShell";

/**
 * Organizer channel — same back-office shell as the admin console. While an
 * event is open (/organization/events/:id/...), the sidebar grows a section
 * for managing that one event: overview & editing, attendees, check-in,
 * refund requests, its activity log.
 */
export function OrganizerLayout() {
  const { pathname: p } = useLocation();
  const eventId = /^\/organizer\/events\/([^/]+)/.exec(p)?.[1];
  const currentEventId = eventId && eventId !== "new" ? eventId : undefined;
  const { data: event } = useQuery({
    queryKey: ["event", currentEventId],
    queryFn: () => eventsApi.getById(currentEventId!),
    enabled: !!currentEventId,
  });

  const base = `/organization/events/${currentEventId}`;
  const sections: ConsoleNavSection[] = [
    { title: "", items: [{ to: "/organization", label: "Thống kê", active: p === "/organization" }] },
    {
      title: "",
      items: [
        { to: "/organization/events", label: "Sự kiện của tôi", active: p === "/organization/events" },
        { to: "/organization/events/new", label: "Tạo sự kiện mới", active: p === "/organization/events/new" },
        { to: "/organization/artists", label: "Nghệ sĩ", active: p === "/organization/artists" },
      ],
    },
    ...(currentEventId
      ? [
          {
            title: "Sự kiện đang quản lý",
            subtitle: event?.title ?? "…",
            items: [
              { to: base, label: "Tổng quan & chỉnh sửa", active: p === base },
              { to: `${base}/attendees`, label: "Khách tham dự", active: p === `${base}/attendees` },
              { to: `${base}/check-in`, label: "Check-in", active: p === `${base}/check-in` },
              { to: `${base}/refunds`, label: "Yêu cầu hoàn vé", active: p === `${base}/refunds` },
            ],
          },
        ]
      : []),
    { title: "", items: [{ to: "/organization/profile", label: "Hồ sơ", active: p === "/organization/profile" }] },
  ];

  return <ConsoleShell homeTo="/organization" sections={sections} />;
}
