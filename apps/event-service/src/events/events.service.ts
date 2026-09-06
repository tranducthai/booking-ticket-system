import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { EventStatus, Prisma } from "../generated/prisma";
import { eventCacheKey, searchCacheKey } from "../common/redis-keys";
import { SingleFlight } from "../common/single-flight";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { CreateEventDto } from "./dto/create-event.dto";
import { RejectEventDto } from "./dto/reject-event.dto";
import { SearchEventsDto } from "./dto/search-events.dto";
import { UpdateEventDto } from "./dto/update-event.dto";

const EVENT_CACHE_TTL_SECONDS = 20; // "event:{id} (TTL 15-30s)" — docs/spec/04-deployment-design.md §2a
const SEARCH_CACHE_TTL_SECONDS = 10; // "search:{queryKey} (TTL 10s)"

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  private readonly singleFlight = new SingleFlight();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * docs/spec/04-deployment-design.md §2a: "Redis read-through cache module
   * — search:{queryKey} (TTL 10s)". No explicit bust on writes — with this
   * many possible query combinations, tracking which cached searches a
   * given event mutation could affect isn't worth it; a 10s TTL is the
   * documented tradeoff (a just-approved event can take up to 10s to show
   * up in someone's already-cached search results).
   */
  async search(query: SearchEventsDto) {
    const cacheKey = searchCacheKey(this.stableQueryKey(query));
    const cached = await this.redis.get(cacheKey).catch(() => null);
    if (cached) return JSON.parse(cached);

    const limit = query.limit ?? 20;
    const cursor = decodeSearchCursor(query.cursor);

    const filters: Prisma.EventWhereInput[] = [{ status: EventStatus.PUBLISHED }];
    if (query.categoryId) filters.push({ categoryId: query.categoryId });
    if (query.keyword) filters.push({ title: { contains: query.keyword, mode: "insensitive" } });
    if (query.location) {
      filters.push({
        OR: [
          { venueName: { contains: query.location, mode: "insensitive" } },
          { venueAddress: { contains: query.location, mode: "insensitive" } },
        ],
      });
    }
    if (query.startDateFrom) filters.push({ startTime: { gte: new Date(query.startDateFrom) } });
    if (query.startDateTo) filters.push({ startTime: { lte: new Date(query.startDateTo) } });
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      // Price lives on TicketType (General Admission) or SeatZone (Seat Map), never on Event
      // itself — "in range" means at least one tier/zone falls in [minPrice, maxPrice].
      const priceRange: Prisma.DecimalFilter = {};
      if (query.minPrice !== undefined) priceRange.gte = query.minPrice;
      if (query.maxPrice !== undefined) priceRange.lte = query.maxPrice;
      filters.push({
        OR: [
          { ticketTypes: { some: { price: priceRange } } },
          { seatMap: { zones: { some: { price: priceRange } } } },
        ],
      });
    }
    // Keyset pagination on (startTime, id) — the same ordering the query
    // sorts by, so this is a plain indexed range scan, not an OFFSET the
    // database has to walk past every time. See decodeSearchCursor's doc
    // comment for why (startTime, id) specifically.
    if (cursor) {
      filters.push({
        OR: [{ startTime: { gt: cursor.startTime } }, { startTime: cursor.startTime, id: { gt: cursor.id } }],
      });
    }

    // docs/spec/12-resilience-and-failure-design.md "events.search: drop
    // COUNT(*)" — no total count query. Fetch one extra row to know
    // whether there's a next page without a second round trip.
    const rows = await this.prisma.event.findMany({
      where: { AND: filters },
      include: { category: true },
      orderBy: [{ startTime: "asc" }, { id: "asc" }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const last = data[data.length - 1];
    const nextCursor = hasMore && last ? encodeSearchCursor(last.startTime, last.id) : null;

    const result = { data, limit, nextCursor, hasMore };
    await this.redis.set(cacheKey, JSON.stringify(result), "EX", SEARCH_CACHE_TTL_SECONDS).catch((err) => {
      this.logger.warn(`Failed to cache search result: ${(err as Error).message}`); // cache is an optimization, not a dependency — a Redis hiccup shouldn't break search
    });
    return result;
  }

  /**
   * Organizer's own events across every status (search() above always
   * filters to PUBLISHED, so a DRAFT/PENDING_APPROVAL/REJECTED event would
   * never show up there for its own owner). Not in the original API
   * contract table; added alongside the organizer dashboard (Phase 7b) —
   * without it there was no way for an organizer to see their own drafts.
   */
  async findMineByOrganizer(organizerId: string, page: number, limit: number) {
    const where: Prisma.EventWhereInput = { organizerId };
    const [data, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        include: { category: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.event.count({ where }),
    ]);
    return { data, page, limit, total };
  }

  /**
   * search() above hard-filters to PUBLISHED, so there was no way for an
   * admin to see the moderation queue at all. Not in the original API
   * contract table; added alongside the admin panel (Phase 7b).
   */
  async findPendingApproval(page: number, limit: number) {
    const where: Prisma.EventWhereInput = { status: EventStatus.PENDING_APPROVAL };
    const [data, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        include: { category: true },
        orderBy: { createdAt: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.event.count({ where }),
    ]);
    return { data, page, limit, total };
  }

  /** Fresh read — used internally by mutations, which must never act on a stale cached copy. */
  async findById(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: { category: true, ticketTypes: true },
    });
    if (!event) {
      throw new NotFoundException("Event not found");
    }
    return event;
  }

  /**
   * The public `GET /events/:id` read-through cache — docs/spec/04-deployment-design.md
   * §2a: "event:{id} (TTL 15-30s)... Postgres gốc chỉ thấy < 50 req/s dù
   * đám đông lớn cỡ nào". Separate from findById() specifically so mutation
   * paths never read a stale cached copy of the row they're about to act on.
   */
  async findByIdCached(id: string) {
    const cacheKey = eventCacheKey(id);
    const cached = await this.redis.get(cacheKey).catch(() => null);
    if (cached) return JSON.parse(cached);

    // single-flight: N concurrent misses on the same id -> 1 Postgres read.
    return this.singleFlight.run(cacheKey, async () => {
      const cachedAgain = await this.redis.get(cacheKey).catch(() => null); // a sibling call may have just filled it
      if (cachedAgain) return JSON.parse(cachedAgain);

      const event = await this.findById(id);
      await this.redis.set(cacheKey, JSON.stringify(event), "EX", EVENT_CACHE_TTL_SECONDS).catch((err) => {
        this.logger.warn(`Failed to cache event ${id}: ${(err as Error).message}`);
      });
      return event;
    });
  }

  create(organizerId: string, dto: CreateEventDto) {
    return this.prisma.event.create({
      data: { ...dto, organizerId, status: EventStatus.DRAFT },
    });
  }

  async update(id: string, organizerId: string, dto: UpdateEventDto) {
    await this.assertOwner(id, organizerId);
    const updated = await this.prisma.event.update({ where: { id }, data: dto });
    await this.bustEventCache(id);
    return updated;
  }

  async submit(id: string, organizerId: string) {
    const event = await this.assertOwner(id, organizerId);
    if (event.status !== EventStatus.DRAFT && event.status !== EventStatus.REJECTED) {
      throw new BadRequestException(`Cannot submit an event in status ${event.status}`);
    }
    const updated = await this.prisma.event.update({
      where: { id },
      data: { status: EventStatus.PENDING_APPROVAL, rejectedReason: null },
    });
    await this.bustEventCache(id);
    return updated;
  }

  async approve(id: string) {
    const event = await this.findById(id);
    if (event.status !== EventStatus.PENDING_APPROVAL) {
      throw new BadRequestException(`Cannot approve an event in status ${event.status}`);
    }
    const updated = await this.prisma.event.update({ where: { id }, data: { status: EventStatus.PUBLISHED } });
    await this.bustEventCache(id);
    return updated;
  }

  async reject(id: string, dto: RejectEventDto) {
    const event = await this.findById(id);
    if (event.status !== EventStatus.PENDING_APPROVAL) {
      throw new BadRequestException(`Cannot reject an event in status ${event.status}`);
    }
    const updated = await this.prisma.event.update({
      where: { id },
      data: { status: EventStatus.REJECTED, rejectedReason: dto.reason },
    });
    await this.bustEventCache(id);
    return updated;
  }

  async setHighDemand(id: string, actor: { userId: string; role: string }, enabled: boolean) {
    const event = await this.findById(id);
    if (actor.role !== "ADMIN" && event.organizerId !== actor.userId) {
      throw new ForbiddenException("You do not own this event");
    }
    const updated = await this.prisma.event.update({ where: { id }, data: { highDemand: enabled } });
    await this.bustEventCache(id);
    return updated;
  }

  /** Loads the event and throws unless `organizerId` owns it. */
  private async assertOwner(id: string, organizerId: string) {
    const event = await this.findById(id);
    if (event.organizerId !== organizerId) {
      throw new ForbiddenException("You do not own this event");
    }
    return event;
  }

  private async bustEventCache(id: string): Promise<void> {
    await this.redis.del(eventCacheKey(id)).catch((err) => {
      this.logger.warn(`Failed to bust event cache for ${id}: ${(err as Error).message}`);
    });
  }

  private stableQueryKey(query: SearchEventsDto): string {
    return JSON.stringify(
      Object.keys(query)
        .sort()
        .reduce((acc: Record<string, unknown>, k) => ({ ...acc, [k]: (query as unknown as Record<string, unknown>)[k] }), {}),
    );
  }
}

/**
 * (startTime, id) rather than just an offset or a single id: startTime
 * alone isn't unique (two events can start at the same instant), so id is
 * the tie-breaker that makes the pair a stable sort key — without it two
 * same-startTime events could be skipped or repeated across pages.
 */
function encodeSearchCursor(startTime: Date, id: string): string {
  return Buffer.from(`${startTime.toISOString()}|${id}`, "utf-8").toString("base64url");
}

function decodeSearchCursor(cursor?: string): { startTime: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const [iso, id] = Buffer.from(cursor, "base64url").toString("utf-8").split("|");
    const startTime = new Date(iso);
    if (!id || Number.isNaN(startTime.getTime())) return null;
    return { startTime, id };
  } catch {
    return null; // a malformed cursor just falls back to page 1 instead of erroring
  }
}
