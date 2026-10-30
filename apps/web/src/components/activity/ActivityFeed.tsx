import { useState } from "react";
import { Link } from "react-router-dom";
import { ACTIVITY_SOURCE_LABEL, type ActivityLog, type ActivityScope, type ActivitySource } from "../../api/activity";
import { useAuth } from "../../auth/AuthContext";
import { useActivityFeed } from "../../hooks/useActivityFeed";
import { formatDateTime } from "../../lib/format";
import { Badge } from "../ui/Badge";
import { EmptyState } from "../ui/EmptyState";
import { Spinner } from "../ui/Spinner";

const ROLE_LABEL: Record<string, string> = { CUSTOMER: "Khách", ORGANIZER: "BTC", ADMIN: "Admin", SYSTEM: "Hệ thống" };

const SOURCE_TONE: Record<ActivitySource, "neutral" | "brand" | "success" | "warning" | "gold"> = {
  user: "neutral",
  event: "brand",
  booking: "success",
  payment: "gold",
  ticket: "warning",
};

/** Failed logins and refused scans stand out — those are the rows an auditor is looking for. */
const isAlert = (action: string) => action.endsWith("_failed") || action.endsWith("_rejected") || action === "user.locked";

/**
 * One merged, time-ordered activity list (docs/spec/14-activity-log-design.md §4).
 * `showTechnical` reveals action codes, IDs, IP and user agent — on for the
 * admin audit view, off for customer/organizer views.
 */
export function ActivityFeed({ scope, sources, showTechnical = false }: { scope: ActivityScope; sources: ActivitySource[]; showTechnical?: boolean }) {
  const { items, loading, hasMore, errors, loadMore } = useActivityFeed(scope, sources);

  return (
    <div>
      {Object.entries(errors).map(([source, message]) => (
        <p key={source} className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Không tải được nhật ký mục "{ACTIVITY_SOURCE_LABEL[source as ActivitySource]}" ({message}) — danh sách bên dưới có thể thiếu.
        </p>
      ))}

      {items.length === 0 && !loading ? (
        <EmptyState title="Chưa có hoạt động nào" />
      ) : (
        <ol className="card divide-y divide-ink-100">
          {items.map((log) => (
            <ActivityRow key={`${log.source}:${log.id}`} log={log} showTechnical={showTechnical} />
          ))}
        </ol>
      )}

      <div className="mt-4 flex justify-center">
        {loading ? (
          <Spinner />
        ) : (
          hasMore &&
          items.length > 0 && (
            <button onClick={() => void loadMore()} className="btn-secondary">
              Tải thêm
            </button>
          )
        )}
      </div>
    </div>
  );
}

function ActivityRow({ log, showTechnical }: { log: ActivityLog; showTechnical: boolean }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const actor =
    log.actorId === "system"
      ? "Hệ thống"
      : log.actorId === "anonymous"
        ? "Không xác định"
        : log.actorId === user?.id
          ? "Bạn"
          : `${ROLE_LABEL[log.actorRole ?? ""] ?? "Người dùng"} #${log.actorId.slice(0, 8)}`;
  const hasDetails = showTechnical || (log.metadata && Object.keys(log.metadata).length > 0) || log.ip;

  return (
    <li className={`px-4 py-3 ${isAlert(log.action) ? "bg-red-50/50" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="w-28 shrink-0 text-xs text-ink-400">{formatDateTime(log.createdAt)}</div>
        <div className="min-w-0 flex-1">
          <p className={`text-sm ${isAlert(log.action) ? "font-semibold text-red-700" : "text-ink-800"}`}>{log.summary}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-500">
            <Badge tone={SOURCE_TONE[log.source]}>{ACTIVITY_SOURCE_LABEL[log.source]}</Badge>
            <span>{actor}</span>
            {log.eventId && (
              <Link to={`/events/${log.eventId}`} className="text-brand-600 hover:underline">
                Xem sự kiện
              </Link>
            )}
            {hasDetails && (
              <button onClick={() => setOpen((v) => !v)} className="font-semibold text-ink-500 hover:text-ink-700">
                {open ? "Ẩn chi tiết" : "Chi tiết"}
              </button>
            )}
          </div>
          {open && (
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-ink-50 p-3 font-mono text-[11px] text-ink-600">
              {showTechnical && (
                <>
                  <dt className="text-ink-400">action</dt>
                  <dd>{log.action}</dd>
                  <dt className="text-ink-400">target</dt>
                  <dd className="break-all">
                    {log.targetType} {log.targetId}
                  </dd>
                  <dt className="text-ink-400">actor</dt>
                  <dd className="break-all">
                    {log.actorId} ({log.actorRole ?? "—"})
                  </dd>
                  {log.subjectUserId && (
                    <>
                      <dt className="text-ink-400">subject</dt>
                      <dd className="break-all">{log.subjectUserId}</dd>
                    </>
                  )}
                  {log.eventId && (
                    <>
                      <dt className="text-ink-400">event</dt>
                      <dd className="break-all">{log.eventId}</dd>
                    </>
                  )}
                </>
              )}
              {log.ip && (
                <>
                  <dt className="text-ink-400">IP</dt>
                  <dd>{log.ip}</dd>
                </>
              )}
              {log.userAgent && (
                <>
                  <dt className="text-ink-400">Thiết bị</dt>
                  <dd className="break-all">{log.userAgent}</dd>
                </>
              )}
              {log.metadata && Object.keys(log.metadata).length > 0 && (
                <>
                  <dt className="text-ink-400">metadata</dt>
                  <dd className="break-all whitespace-pre-wrap">{JSON.stringify(log.metadata, null, 1)}</dd>
                </>
              )}
            </dl>
          )}
        </div>
      </div>
    </li>
  );
}
