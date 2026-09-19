import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import { loadAuth } from "../api/client";
import { notificationsApi } from "../api/notifications";
import type { AppNotification } from "../api/types";
import { useAuth } from "../auth/AuthContext";

// notification-service's Socket.io gateway isn't proxied through the
// api-gateway (see apps/api-gateway/src/proxy/routes.ts) — connect to it
// directly, same as the REST base URL pattern in api/client.ts but for WS.
const WS_URL = import.meta.env.VITE_NOTIFICATION_WS_URL || "http://localhost:3006";

/**
 * Live unread count (Socket.io push) + the query the bell's dropdown reads
 * from — kept in one hook so NotificationBell doesn't have to know about
 * the socket at all. One connection per signed-in session, closed on
 * logout.
 */
export function useNotifications() {
  const { isAuthenticated } = useAuth();
  const qc = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: notificationsApi.unreadCount,
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!isAuthenticated) return;
    const token = loadAuth()?.accessToken;
    if (!token) return;

    const socket = io(`${WS_URL}/notifications`, { auth: { token }, transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("notification", (_notification: AppNotification) => {
      qc.setQueryData<number>(["notifications", "unread-count"], (n) => (n ?? 0) + 1);
      qc.invalidateQueries({ queryKey: ["notifications", "list"] });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated, qc]);

  return { unreadCount };
}
