import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { EventStatus, Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { cityOf, RecItem, recommend } from "./recommender";

const CANDIDATE_POOL = 300; // newest-starting upcoming events considered per request — plenty at this scale
const CACHE_TTL_SECONDS = 600; // recommendations drift slowly; a new favorite showing up 10 min late is fine

const EVENT_FOR_RECS = {
  category: true,
  ticketTypes: { select: { price: true, isHidden: true } },
  seatMap: { select: { zones: { select: { price: true } } } },
  lineup: { select: { artist: { select: { name: true } } } },
} satisfies Prisma.EventInclude;
type EventRow = Prisma.EventGetPayload<{ include: typeof EVENT_FOR_RECS }>;

/** Lowest price a buyer can pay: visible ticket tiers, or seat-map zones. */
function minPrice(e: EventRow): number | null {
  const prices = [
    ...e.ticketTypes.filter((t) => !t.isHidden).map((t) => Number(t.price)),
    ...(e.seatMap?.zones.map((z) => Number(z.price)) ?? []),
  ].filter((p) => p > 0);
  return prices.length ? Math.min(...prices) : null;
}

function toRecItem(e: EventRow): RecItem {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    categorySlug: e.category?.slug ?? null,
    organizerId: e.organizerId,
    artistNames: e.lineup.map((l) => l.artist.name),
    city: cityOf(e.venueAddress),
    minPrice: minPrice(e),
    startTime: e.startTime,
  };
}

/** GET /events/:id/recommendations — "Có thể bạn cũng thích" (see recommender.ts for the scoring). */
@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async forEvent(eventId: string, limit: number) {
    const cacheKey = `recs:${eventId}:${limit}`;
    const cached = await this.redis.get(cacheKey).catch(() => null);
    if (cached) return JSON.parse(cached);

    const anchorRow = await this.prisma.event.findUnique({ where: { id: eventId }, include: EVENT_FOR_RECS });
    if (!anchorRow) throw new NotFoundException("Event not found");

    const rows = await this.prisma.event.findMany({
      where: { status: EventStatus.PUBLISHED, endTime: { gt: new Date() }, id: { not: eventId } },
      include: EVENT_FOR_RECS,
      orderBy: { startTime: "asc" },
      take: CANDIDATE_POOL,
    });

    const ids = [eventId, ...rows.map((r) => r.id)];
    const favorites = await this.prisma.eventFavorite.findMany({ where: { eventId: { in: ids } }, select: { eventId: true, userId: true } });
    const fans = new Map<string, Set<string>>();
    for (const f of favorites) {
      if (!fans.has(f.eventId)) fans.set(f.eventId, new Set());
      fans.get(f.eventId)!.add(f.userId);
    }

    const anchor = toRecItem(anchorRow);
    const ranked = recommend(anchor, rows.map(toRecItem), fans, { limit });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const anchorArtists = new Set(anchor.artistNames.map((a) => a.toLowerCase()));

    const result = ranked.map(({ id, score, parts }) => {
      const e = byId.get(id)!;
      const sharedArtist = e.lineup.find((l) => anchorArtists.has(l.artist.name.toLowerCase()))?.artist.name;
      // One human-readable "why" — the strongest signal that actually applies.
      const reason = sharedArtist
        ? `Cùng nghệ sĩ ${sharedArtist}`
        : parts.collab >= 0.2
          ? "Người thích sự kiện này cũng thích"
          : e.category && e.category.slug === anchor.categorySlug
            ? `Cùng thể loại ${e.category.name}`
            : parts.city
              ? "Cùng thành phố"
              : null;
      return {
        id: e.id,
        title: e.title,
        bannerUrl: e.bannerUrl,
        startTime: e.startTime,
        endTime: e.endTime,
        venueName: e.venueName,
        venueAddress: e.venueAddress,
        city: e.venueAddress.split(",").pop()!.trim(),
        category: e.category,
        minPrice: minPrice(e),
        score: Math.round(score * 1000) / 1000,
        reason,
      };
    });

    await this.redis.set(cacheKey, JSON.stringify(result), "EX", CACHE_TTL_SECONDS).catch((err) => {
      this.logger.warn(`Failed to cache recommendations for ${eventId}: ${(err as Error).message}`);
    });
    return result;
  }
}
