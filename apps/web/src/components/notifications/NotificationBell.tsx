import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { notificationsApi } from "../../api/notifications";
import type { AppNotification } from "../../api/types";
import { useNotifications } from "../../hooks/useNotifications";
import { formatDateTime } from "../../lib/format";

/** Where a click on a notification navigates — varies by type, not just by which id happens to be present in `data`. */
function targetPath(n: AppNotification): string | null {
  switch (n.type) {
    case "EVENT_APPROVED":
    case "EVENT_REJECTED":
      return n.data?.eventId ? `/kenh-to-chuc/su-kien/${n.data.eventId}` : null;
    case "EVENT_REMINDER":
      return n.data?.eventId ? `/su-kien/${n.data.eventId}` : null;
    case "ORDER_PAID":
    case "TICKET_ISSUED":
    case "REFUND_APPROVED":
      return n.data?.orderId ? `/don-hang/${n.data.orderId}` : null;
    default:
      return null;
  }
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { unreadCount } = useNotifications();

  const { data } = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => notificationsApi.list({ limit: 10 }),
    enabled: open,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllRead = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  function onClickNotification(n: AppNotification) {
    if (!n.readAt) markRead.mutate(n.id);
    setOpen(false);
    const path = targetPath(n);
    if (path) navigate(path);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full hover:bg-ink-100"
        aria-label="Thông báo"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-ink-600">
          <path
            d="M12 3a6 6 0 00-6 6v3.5c0 .8-.3 1.6-.9 2.2L4 16h16l-1.1-1.3a3 3 0 01-.9-2.2V9a6 6 0 00-6-6Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path d="M9.5 19a2.5 2.5 0 005 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-[1.125rem] items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-80 overflow-hidden rounded-xl border border-ink-100 bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-2.5">
            <span className="text-sm font-bold text-ink-800">Thông báo</span>
            {unreadCount > 0 && (
              <button onClick={() => markAllRead.mutate()} className="text-xs font-semibold text-brand-600 hover:underline">
                Đánh dấu đã đọc tất cả
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {data?.data.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-400">Chưa có thông báo nào.</p>}
            {data?.data.map((n) => (
              <button
                key={n.id}
                onClick={() => onClickNotification(n)}
                className={`block w-full border-b border-ink-50 px-4 py-3 text-left hover:bg-ink-50 ${!n.readAt ? "bg-brand-50/40" : ""}`}
              >
                <p className="text-sm font-semibold text-ink-800">{n.title}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">{n.body}</p>
                <p className="mt-1 text-[11px] text-ink-400">{formatDateTime(n.createdAt)}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
