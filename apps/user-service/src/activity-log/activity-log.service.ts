import { Injectable, Logger } from "@nestjs/common";
import { ActivityLog, Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { ListActivityLogsDto } from "./dto/list-activity-logs.dto";
import { requestContext } from "./request-context";

/** Which service a row came from — the frontend merges five of these feeds. */
export const ACTIVITY_SOURCE = "user";

export interface ActivityEntry {
  /** "<entity>.<verb>", e.g. "order.created" — see docs/spec/14-activity-log-design.md §2 for the catalog. */
  action: string;
  targetType: string;
  targetId?: string | null;
  /** Event this concerns — what the organizer's per-event log filters on. */
  eventId?: string | null;
  /** Customer account this concerns (buyer, ticket holder) — what "my activity" filters on, besides actorId. */
  subjectUserId?: string | null;
  /** Human-readable, Vietnamese — rendered as-is by the frontend. */
  summary: string;
  /** Small structured context. NEVER secrets: no passwords, tokens, QR payloads, card/bank data. */
  metadata?: Record<string, unknown>;
  /** Defaults to the request's X-User-Id, or "system" outside a request (broker consumers, crons). */
  actorId?: string;
  actorRole?: string;
}

/**
 * Append-only activity/audit log, one table per service
 * (docs/spec/14-activity-log-design.md). Writes are BEST-EFFORT by design:
 * record() never throws — a failed log write is logged and swallowed so it
 * can't fail the business action it describes. The table itself rejects
 * UPDATE/DELETE (trigger in the migration).
 */
@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: ActivityEntry): Promise<void> {
    const ctx = requestContext.getStore();
    const actorId = entry.actorId ?? ctx?.actorId ?? "system";
    const actorRole =
      entry.actorRole ?? (actorId === ctx?.actorId ? ctx?.actorRole : undefined) ?? (actorId === "system" ? "SYSTEM" : null);
    try {
      await this.prisma.activityLog.create({
        data: {
          actorId,
          actorRole,
          action: entry.action,
          targetType: entry.targetType,
          targetId: entry.targetId ?? null,
          eventId: entry.eventId ?? null,
          subjectUserId: entry.subjectUserId ?? null,
          summary: entry.summary.slice(0, 500),
          metadata: entry.metadata ? (JSON.parse(JSON.stringify(entry.metadata)) as Prisma.InputJsonValue) : undefined,
          ip: ctx?.ip ?? null,
          userAgent: ctx?.userAgent ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(`Activity log write failed (${entry.action} ${entry.targetId ?? ""}): ${(err as Error).message}`);
    }
  }

  /** A customer's own feed: what they did, and what happened to their orders/tickets/refunds. */
  listMine(userId: string, query: ListActivityLogsDto) {
    return this.list({ OR: [{ actorId: userId }, { subjectUserId: userId }] }, query, false);
  }

  /** Organizer's per-event log. Caller must already have checked event ownership. Buyers' IP/user agent are not the organizer's business. */
  listForEvent(eventId: string, query: ListActivityLogsDto) {
    return this.list({ eventId }, query, true);
  }

  /** Admin audit view — everything, with filters. */
  listAll(query: ListActivityLogsDto) {
    return this.list({}, query, false);
  }

  private async list(scope: Prisma.ActivityLogWhereInput, query: ListActivityLogsDto, redactNetwork: boolean) {
    const limit = query.limit ?? 30;
    const cursor = parseCursor(query.before);
    const filters: Prisma.ActivityLogWhereInput[] = [scope];
    if (query.actorId) filters.push({ actorId: query.actorId });
    if (query.subjectUserId) filters.push({ subjectUserId: query.subjectUserId });
    if (query.action) filters.push({ action: { startsWith: query.action } });
    if (query.targetType) filters.push({ targetType: query.targetType });
    if (query.targetId) filters.push({ targetId: query.targetId });
    if (query.eventId) filters.push({ eventId: query.eventId });
    if (query.from) filters.push({ createdAt: { gte: new Date(query.from) } });
    if (query.to) filters.push({ createdAt: { lte: new Date(query.to) } });
    if (cursor) {
      filters.push({ OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] });
    }

    const rows = await this.prisma.activityLog.findMany({
      where: { AND: filters },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    return {
      source: ACTIVITY_SOURCE,
      data: page.map((row) => toView(row, redactNetwork)),
      nextBefore: rows.length > limit ? encodeCursor(page[page.length - 1]) : null,
    };
  }
}

/** Keyset cursor `<ISO createdAt>_<id>` — stable under ties and concurrent inserts, unlike page/offset. */
function encodeCursor(row: Pick<ActivityLog, "createdAt" | "id">): string {
  return `${row.createdAt.toISOString()}_${row.id}`;
}

function parseCursor(raw?: string): { createdAt: Date; id: string } | null {
  if (!raw) return null;
  const sep = raw.indexOf("_");
  if (sep === -1) return null;
  const createdAt = new Date(raw.slice(0, sep));
  return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id: raw.slice(sep + 1) };
}

function toView(row: ActivityLog, redactNetwork: boolean) {
  return {
    ...row,
    source: ACTIVITY_SOURCE,
    cursor: encodeCursor(row),
    ip: redactNetwork ? null : row.ip,
    userAgent: redactNetwork ? null : row.userAgent,
  };
}
