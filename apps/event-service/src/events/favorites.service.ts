import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Customer's saved/wishlisted events (docs/spec/01-business-analysis.md
 * doesn't call this out explicitly, but every real ticketing platform has
 * it) — a thin join table, no cache layer: unlike search()/findByIdCached(),
 * this is always a per-user read scoped to a handful of rows, not a hot
 * shared path worth caching.
 */
@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Idempotent — favoriting an already-favorited event is a no-op, not a 409 (the customer's intent, "save this", is already satisfied). */
  async add(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException("Event not found");
    }
    await this.prisma.eventFavorite.upsert({
      where: { userId_eventId: { userId, eventId } },
      create: { userId, eventId },
      update: {},
    });
    return { favorited: true };
  }

  /** Also idempotent — removing a never-favorited event is a no-op. */
  async remove(userId: string, eventId: string) {
    await this.prisma.eventFavorite.deleteMany({ where: { userId, eventId } });
    return { favorited: false };
  }

  async listMine(userId: string, page: number, limit: number) {
    const where = { userId };
    const [rows, total] = await Promise.all([
      this.prisma.eventFavorite.findMany({
        where,
        include: { event: { include: { category: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.eventFavorite.count({ where }),
    ]);
    // Surface Event rows directly (favoritedAt alongside) rather than the join rows —
    // callers want "my saved events", the EventFavorite id itself is an implementation detail.
    return { data: rows.map((r) => ({ ...r.event, favoritedAt: r.createdAt })), page, limit, total };
  }

  /** Bulk membership check for a page of search results — one query instead of N. */
  async favoritedEventIds(userId: string, eventIds: string[]): Promise<Set<string>> {
    if (eventIds.length === 0) return new Set();
    const rows = await this.prisma.eventFavorite.findMany({
      where: { userId, eventId: { in: eventIds } },
      select: { eventId: true },
    });
    return new Set(rows.map((r) => r.eventId));
  }
}
