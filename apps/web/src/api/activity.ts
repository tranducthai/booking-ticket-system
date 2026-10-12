import { api } from "./client";

/**
 * Activity / audit logs — docs/spec/14-activity-log-design.md. Every backend
 * service keeps its own append-only ActivityLog and exposes the same three
 * routes; this module fetches them per service and the feed hook
 * (src/hooks/useActivityFeed.ts) merges them by time.
 */
export type ActivitySource = "user" | "event" | "booking" | "payment" | "ticket";

export const ACTIVITY_SOURCES: ActivitySource[] = ["user", "event", "booking", "payment", "ticket"];

/** user-service logs nothing event-scoped, so it has no per-event route. */
export const EVENT_SCOPED_SOURCES: ActivitySource[] = ["event", "booking", "payment", "ticket"];

export const ACTIVITY_SOURCE_LABEL: Record<ActivitySource, string> = {
  user: "Tài khoản",
  event: "Sự kiện",
  booking: "Đơn hàng",
  payment: "Thanh toán",
  ticket: "Vé",
};

export interface ActivityLog {
  id: string;
  source: ActivitySource;
  cursor: string;
  actorId: string;
  actorRole: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  eventId: string | null;
  subjectUserId: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
  /** null on the organizer's per-event view (buyers' network details aren't theirs to see). */
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface ActivityPage {
  source: ActivitySource;
  data: ActivityLog[];
  nextBefore: string | null;
}

export interface ActivityFilters {
  actorId?: string;
  subjectUserId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  eventId?: string;
  from?: string;
  to?: string;
}

export type ActivityScope = { kind: "mine" } | { kind: "event"; eventId: string } | { kind: "admin"; filters: ActivityFilters };

export function fetchActivityPage(source: ActivitySource, scope: ActivityScope, before: string | undefined, limit: number) {
  const path =
    scope.kind === "mine"
      ? `/${source}/activity-logs/mine`
      : scope.kind === "event"
        ? `/${source}/activity-logs/events/${scope.eventId}`
        : `/${source}/activity-logs`;
  const filters = scope.kind === "admin" ? scope.filters : {};
  return api.get<ActivityPage>(path, { params: { before, limit, ...filters } }).then((r) => r.data);
}
