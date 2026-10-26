import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  EventApprovedPayload,
  EventCanceledPayload,
  EventPostponedPayload,
  EventRejectedPayload,
  EXCHANGES,
  ROUTING_KEYS,
} from "@booking-ticket-system/event-contracts";
import { EventStatus, Prisma } from "../generated/prisma";
import { eventCacheKey, searchCacheKey } from "../common/redis-keys";
import { SingleFlight } from "../common/single-flight";
import { PrismaService } from "../prisma/prisma.service";
import { RabbitMqService } from "../rabbitmq/rabbitmq.service";
import { RedisService } from "../redis/redis.service";
import { CreateEventDto } from "./dto/create-event.dto";
import { CancelEventDto, PostponeEventDto, RejectCancelRequestDto, RequestCancelEventDto } from "./dto/event-lifecycle.dto";
import { RejectEventDto } from "./dto/reject-event.dto";
import { SearchEventsDto } from "./dto/search-events.dto";
import { UpdateEventDto } from "./dto/update-event.dto";
import { EventPrivateInfoDto } from "./dto/event-private-info.dto";
import { sanitizeRichText } from "../common/rich-text-sanitizer";
import { MAX_EVENT_DAYS } from "../common/validators";
import { AdminListEventsDto } from "./dto/admin-list-events.dto";
import { canManage, Manager } from "../auth/manager";

const EVENT_CACHE_TTL_SECONDS = 20; // "event:{id} (TTL 15-30s)" — docs/spec/04-deployment-design.md §2a
const SEARCH_CACHE_TTL_SECONDS = 10; // "search:{queryKey} (TTL 10s)"
// docs/spec/13-refund-and-anti-fraud-design.md §2.3 — same 3-day notice Ticketbox requires of its organizers.
const MIN_CANCEL_NOTICE_HOURS = 72;
// §2.4 — how long ticket holders may claim a full refund after a postponement.
const POSTPONE_REFUND_WINDOW_DAYS = 14;

/** class-validator DTO instance -> plain JSON Prisma accepts for a Json column. */
function toJson(value: object): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** What an event list needs to show sales progress — see withSalesTotals. */
const SALES_INCLUDE = {
  category: true,
  ticketTypes: { select: { quantityTotal: true, quantitySold: true } },
  seatMap: { select: { zones: { select: { seats: { select: { status: true } } } } } },
} satisfies Prisma.EventInclude;

/** Tickets sold / available across ticket types, or booked / total seats for a SEATMAP event. */
function withSalesTotals<
  T extends {
    ticketTypes: { quantityTotal: number; quantitySold: number }[];
    seatMap: { zones: { seats: { status: string }[] }[] } | null;
  },
>({ ticketTypes, seatMap, ...event }: T) {
  const seats = seatMap?.zones.flatMap((z) => z.seats) ?? [];
  const ticketsTotal = ticketTypes.reduce((n, t) => n + t.quantityTotal, 0) + seats.length;
  const ticketsSold = ticketTypes.reduce((n, t) => n + t.quantitySold, 0) + seats.filter((seat) => seat.status === "BOOKED").length;
  return { ...event, ticketsSold, ticketsTotal };
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  private readonly singleFlight = new SingleFlight();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly rabbit: RabbitMqService,
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
          { ticketTypes: { some: { price: priceRange, isHidden: false } } },
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
    const [rows, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        include: SALES_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.event.count({ where }),
    ]);
    return { data: rows.map(withSalesTotals), page, limit, total };
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

  /**
   * Admin console's "all events" view — every status, filterable, with sales
   * totals per event (sum over its ticket types, or its seat map's booked
   * seats for SEATMAP events) so the list shows how each one is selling.
   */
  async findAllForAdmin(query: AdminListEventsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const q = query.q?.trim();
    const where: Prisma.EventWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.organizerId ? { organizerId: query.organizerId } : {}),
      ...(q
        ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { venueName: { contains: q, mode: "insensitive" } }] }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        include: SALES_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.event.count({ where }),
    ]);
    return { data: rows.map(withSalesTotals), page, limit, total };
  }

  /** A published event must be buyable: at least one visible ticket type, or a seat map — unless entry is free and open. */
  private async assertSellable(event: { id: string; ticketMode: string; ticketTypes: { isHidden: boolean }[] }) {
    if (event.ticketMode === "FREE_ENTRY") return;
    if (event.ticketMode === "SEATMAP") {
      const seatMap = await this.prisma.seatMap.findUnique({ where: { eventId: event.id }, select: { id: true } });
      if (!seatMap) throw new BadRequestException("Sự kiện chưa có sơ đồ chỗ ngồi — không thể đăng bán");
    } else if (!event.ticketTypes.some((t) => !t.isHidden)) {
      throw new BadRequestException("Sự kiện chưa có hạng vé đang mở bán — không thể đăng bán");
    }
  }

  /** Fresh read — used internally by mutations, which must never act on a stale cached copy. */
  async findById(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        category: true,
        ticketTypes: { orderBy: { price: "desc" } },
        showtimes: { orderBy: { startTime: "asc" } },
        lineup: { include: { artist: true }, orderBy: { order: "asc" } },
      },
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

  /**
   * Public GET /events/:id. Drafts, events awaiting approval and rejected
   * ones are the organizer's (and admins') business only — answered as 404
   * to everyone else so their existence doesn't leak either. Canceled
   * events stay visible: buyers need to see what happened.
   */
  async findVisible(id: string, actor: { userId: string | null; role: string | null }) {
    const event = await this.findByIdCached(id);
    const isPublic = event.status === EventStatus.PUBLISHED || event.status === EventStatus.CANCELED;
    const isManager = actor.role === "ADMIN" || event.organizerId === actor.userId;
    if (!isPublic && !isManager) {
      throw new NotFoundException("Event not found");
    }
    // Hidden tiers (TicketType.isHidden) stay in the shared cached body — only
    // the organizer/admin see them; everyone else gets them filtered out here.
    if (!isManager && Array.isArray(event.ticketTypes)) {
      return { ...event, ticketTypes: event.ticketTypes.filter((t: { isHidden?: boolean }) => !t.isHidden) };
    }
    return event;
  }

  /** GET /events/:id/private-info — organizer (owner) or admin only; empty fields when nothing was saved yet. */
  async getPrivateInfo(id: string, actor: Manager) {
    await this.assertOwner(id, actor);
    const info = await this.prisma.eventPrivateInfo.findUnique({ where: { eventId: id } });
    return info ?? { eventId: id };
  }

  /** PUT /events/:id/private-info — partial upsert; "" clears a field. */
  async updatePrivateInfo(id: string, actor: Manager, dto: EventPrivateInfoDto) {
    await this.assertOwner(id, actor);
    const data = Object.fromEntries(
      Object.entries(dto)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, typeof v === "string" ? v.trim() || null : v]),
    );
    return this.prisma.eventPrivateInfo.upsert({ where: { eventId: id }, create: { eventId: id, ...data }, update: data });
  }

  /** Internal, for ticket-service: the join link it shows on a holder's ticket page. */
  async findOnlineAccess(id: string) {
    const event = await this.prisma.event.findUnique({ where: { id }, select: { isOnline: true, privateInfo: { select: { onlineUrl: true } } } });
    if (!event) throw new NotFoundException("Event not found");
    return { isOnline: event.isOnline, onlineUrl: event.isOnline ? (event.privateInfo?.onlineUrl ?? null) : null };
  }

  create(organizerId: string, dto: CreateEventDto) {
    const { refundPolicy, organizerId: _requestedOwner, ...rest } = dto;
    assertEventSchedule(rest.startTime, rest.endTime, rest.salesEndTime);
    if (rest.description !== undefined) rest.description = sanitizeRichText(rest.description);
    return this.prisma.event.create({
      data: { ...rest, refundPolicy: refundPolicy ? toJson(refundPolicy) : undefined, organizerId, status: EventStatus.DRAFT },
    });
  }

  async update(id: string, actor: Manager, dto: UpdateEventDto) {
    const event = await this.assertOwner(id, actor);
    const { refundPolicy, ...rest } = dto;
    // The "Giới thiệu" is organizer-written HTML shown to every visitor — stored only after the allow-list pass.
    if (rest.description !== undefined) rest.description = sanitizeRichText(rest.description);
    // Buyers are held to the policy that was on the page when they paid —
    // payment-service reads the live value at refund time, so it must not
    // move under them once the event is on sale (docs/spec/13 §2.1).
    if (refundPolicy !== undefined && event.status !== EventStatus.DRAFT && event.status !== EventStatus.REJECTED) {
      throw new BadRequestException("Chính sách hoàn vé chỉ được sửa khi sự kiện còn ở trạng thái nháp hoặc bị từ chối");
    }
    if (event.status === EventStatus.CANCELED) {
      throw new BadRequestException("Sự kiện đã hủy, không thể chỉnh sửa");
    }
    // A multi-showtime event's dates are derived from its showtimes (showtimes.service.ts syncEventSpan).
    if (event.showtimes.length > 0 && (rest.startTime !== undefined || rest.endTime !== undefined)) {
      throw new BadRequestException("Sự kiện có nhiều suất diễn — thời gian được tính từ lịch diễn, hãy sửa từng suất");
    }
    // Once on sale, the date and the venue are what buyers paid for: moving
    // the date must go through postpone() (which opens the 100% refund
    // window), a venue change through an admin. Editing them here would
    // dodge both — docs/spec/13-refund-and-anti-fraud-design.md §2.4.
    if (event.status === EventStatus.PUBLISHED) {
      const locked = (["startTime", "endTime", "venueName", "venueAddress", "isOnline", "province", "ward", "streetAddress"] as const).filter(
        (k) => rest[k] !== undefined,
      );
      if (locked.length > 0) {
        throw new BadRequestException(
          `Sự kiện đang mở bán — không sửa trực tiếp ${locked.join(", ")}. Dùng chức năng "Dời lịch" hoặc liên hệ quản trị viên để đổi địa điểm.`,
        );
      }
    }
    // After the lock checks above. Only one of the pair may be sent — check the resulting schedule, not just the DTO.
    if (rest.startTime !== undefined || rest.endTime !== undefined || rest.salesEndTime !== undefined) {
      assertEventSchedule(rest.startTime ?? event.startTime, rest.endTime ?? event.endTime, rest.salesEndTime ?? event.salesEndTime ?? undefined);
    }
    const updated = await this.prisma.event.update({
      where: { id },
      data: { ...rest, ...(refundPolicy !== undefined ? { refundPolicy: toJson(refundPolicy) } : {}) },
    });
    await this.bustEventCache(id);
    return updated;
  }

  async submit(id: string, organizerId: string) {
    const event = await this.assertOwner(id, { userId: organizerId });
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

  /**
   * PENDING_APPROVAL -> PUBLISHED is the normal moderation path; an admin may
   * also publish a DRAFT/REJECTED event directly — e.g. one they created on
   * a partner's behalf (create() with organizerId). Either way it must have
   * something to sell first, or buyers land on an event with no tickets.
   */
  async approve(id: string) {
    const event = await this.findById(id);
    const publishable: EventStatus[] = [EventStatus.PENDING_APPROVAL, EventStatus.DRAFT, EventStatus.REJECTED];
    if (!publishable.includes(event.status)) {
      throw new BadRequestException(`Cannot approve an event in status ${event.status}`);
    }
    await this.assertSellable(event);
    const updated = await this.prisma.event.update({ where: { id }, data: { status: EventStatus.PUBLISHED } });
    await this.bustEventCache(id);
    const payload: EventApprovedPayload = { eventId: updated.id, organizerId: updated.organizerId, title: updated.title };
    await this.rabbit.publish(EXCHANGES.EVENT, ROUTING_KEYS.EVENT_APPROVED, payload);
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
    const payload: EventRejectedPayload = {
      eventId: updated.id,
      organizerId: updated.organizerId,
      title: updated.title,
      reason: dto.reason,
    };
    await this.rabbit.publish(EXCHANGES.EVENT, ROUTING_KEYS.EVENT_REJECTED, payload);
    return updated;
  }

  /**
   * docs/spec/13-refund-and-anti-fraud-design.md §2.3 — the organizer can't
   * cancel unilaterally (payouts and mass refunds hang off this), they file
   * a request that an admin approves. Sales stop the moment it's filed.
   */
  async requestCancel(id: string, organizerId: string, dto: RequestCancelEventDto) {
    const event = await this.assertOwner(id, { userId: organizerId });
    if (event.status !== EventStatus.PUBLISHED) {
      throw new BadRequestException(`Không thể yêu cầu hủy sự kiện ở trạng thái ${event.status}`);
    }
    if (event.cancelRequestedAt) {
      throw new BadRequestException("Sự kiện đã có yêu cầu hủy đang chờ duyệt");
    }
    const hoursUntilStart = (event.startTime.getTime() - Date.now()) / 3_600_000;
    if (hoursUntilStart < MIN_CANCEL_NOTICE_HOURS) {
      throw new BadRequestException(
        `Phải gửi yêu cầu hủy trước giờ diễn ít nhất ${MIN_CANCEL_NOTICE_HOURS} giờ — liên hệ quản trị viên để xử lý khẩn cấp`,
      );
    }
    const updated = await this.prisma.event.update({
      where: { id },
      data: { cancelRequestedAt: new Date(), cancelRequestReason: dto.reason },
    });
    await this.bustEventCache(id);
    return updated;
  }

  async findCancelRequests(page: number, limit: number) {
    const where: Prisma.EventWhereInput = { status: EventStatus.PUBLISHED, cancelRequestedAt: { not: null } };
    const [data, total] = await Promise.all([
      this.prisma.event.findMany({ where, orderBy: { cancelRequestedAt: "asc" }, skip: (page - 1) * limit, take: limit }),
      this.prisma.event.count({ where }),
    ]);
    return { data, page, limit, total };
  }

  async rejectCancelRequest(id: string, dto: RejectCancelRequestDto) {
    const event = await this.findById(id);
    if (!event.cancelRequestedAt || event.status !== EventStatus.PUBLISHED) {
      throw new BadRequestException("Sự kiện không có yêu cầu hủy đang chờ duyệt");
    }
    const updated = await this.prisma.event.update({
      where: { id },
      data: { cancelRequestedAt: null, cancelRequestReason: null },
    });
    await this.bustEventCache(id);
    this.logger.log(`Cancel request for event ${id} rejected: ${dto.reason}`);
    return updated;
  }

  /**
   * Admin-only. Either approves a pending organizer request or cancels
   * outright (force majeure, organizer gone dark). Publishes EventCanceled:
   * ticket-service voids every ticket, payment-service refunds every paid
   * order 100%, booking-service cancels unpaid orders, notification-service
   * tells every holder.
   */
  async cancel(id: string, dto: CancelEventDto) {
    const event = await this.findById(id);
    if (event.status !== EventStatus.PUBLISHED && event.status !== EventStatus.PENDING_APPROVAL) {
      throw new BadRequestException(`Không thể hủy sự kiện ở trạng thái ${event.status}`);
    }
    const reason = dto.reason ?? event.cancelRequestReason;
    if (!reason) {
      throw new BadRequestException("Cần nêu lý do hủy sự kiện");
    }
    // Conditional update: two admins clicking at once publish EventCanceled once, not twice.
    const { count } = await this.prisma.event.updateMany({
      where: { id, status: event.status },
      data: { status: EventStatus.CANCELED, canceledAt: new Date(), cancelReason: reason },
    });
    if (count === 0) {
      throw new BadRequestException("Sự kiện vừa được cập nhật bởi người khác — tải lại và thử lại");
    }
    await this.bustEventCache(id);
    const updated = await this.findById(id);
    const payload: EventCanceledPayload = {
      eventId: id,
      organizerId: updated.organizerId,
      title: updated.title,
      reason,
      canceledAt: updated.canceledAt!.toISOString(),
    };
    await this.rabbit.publish(EXCHANGES.EVENT, ROUTING_KEYS.EVENT_CANCELED, payload);
    return updated;
  }

  /** §2.4 — owner or admin. Tickets stay valid for the new date; holders who can't make it get a 100% refund window. */
  async postpone(id: string, actor: { userId: string; role: string }, dto: PostponeEventDto) {
    const event = await this.findById(id);
    if (actor.role !== "ADMIN" && event.organizerId !== actor.userId) {
      throw new ForbiddenException("You do not own this event");
    }
    if (event.status !== EventStatus.PUBLISHED) {
      throw new BadRequestException(`Không thể dời sự kiện ở trạng thái ${event.status}`);
    }
    if (event.showtimes.length > 0) {
      throw new BadRequestException("Sự kiện có nhiều suất diễn — không dời cả sự kiện; hãy xử lý từng suất");
    }
    if (dto.startTime <= event.startTime) {
      throw new BadRequestException("Ngày diễn mới phải sau ngày diễn hiện tại");
    }
    if (dto.endTime <= dto.startTime) {
      throw new BadRequestException("Giờ kết thúc phải sau giờ bắt đầu");
    }
    const now = new Date();
    const refundWindowEndsAt = new Date(
      Math.min(now.getTime() + POSTPONE_REFUND_WINDOW_DAYS * 86_400_000, dto.startTime.getTime()),
    );
    const updated = await this.prisma.event.update({
      where: { id },
      data: {
        startTime: dto.startTime,
        endTime: dto.endTime,
        postponedAt: now,
        refundWindowEndsAt,
        reminderSentAt: null, // the T-24h reminder must fire again for the new date
      },
    });
    await this.bustEventCache(id);
    const payload: EventPostponedPayload = {
      eventId: id,
      organizerId: updated.organizerId,
      title: updated.title,
      previousStartTime: event.startTime.toISOString(),
      newStartTime: dto.startTime.toISOString(),
      refundWindowEndsAt: refundWindowEndsAt.toISOString(),
    };
    await this.rabbit.publish(EXCHANGES.EVENT, ROUTING_KEYS.EVENT_POSTPONED, payload);
    return updated;
  }

  /** Internal read for payment-service's refund quote — fresh, never the public cache. */
  async findForRefund(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      select: {
        id: true,
        organizerId: true,
        title: true,
        status: true,
        startTime: true,
        refundPolicy: true,
        postponedAt: true,
        refundWindowEndsAt: true,
      },
    });
    if (!event) {
      throw new NotFoundException("Event not found");
    }
    return event;
  }

  async setLateSales(id: string, actor: { userId: string; role: string }, until: Date | null) {
    const event = await this.findById(id);
    if (actor.role !== "ADMIN" && event.organizerId !== actor.userId) {
      throw new ForbiddenException("You do not own this event");
    }
    if (until) {
      if (event.status !== EventStatus.PUBLISHED || event.cancelRequestedAt) throw new BadRequestException("Chỉ mở bán lại được sự kiện đang hoạt động");
      const now = Date.now();
      if (event.ticketMode === "FREE_ENTRY") throw new BadRequestException("Sự kiện vào cửa tự do không có vé");
      if (!event.salesEndTime || event.salesEndTime.getTime() > now) throw new BadRequestException("Vé vẫn đang trong thời gian mở bán — chỉ mở bán lại sau khi đã đóng bán");
      if (until.getTime() <= now) throw new BadRequestException("Thời gian mở bán lại phải ở tương lai");
      if (until.getTime() > event.startTime.getTime()) throw new BadRequestException("Chỉ mở bán lại tới giờ sự kiện bắt đầu");
    }
    const updated = await this.prisma.event.update({ where: { id }, data: { lateSalesUntil: until } });
    await this.bustEventCache(id);
    return updated;
  }

  /** Public list for the "Bán lại vé" page — BTC reopened unsold tickets after the deadline. */
  findLateSales() {
    return this.prisma.event.findMany({
      where: { status: EventStatus.PUBLISHED, lateSalesUntil: { gt: new Date() } },
      include: { category: true },
      orderBy: { startTime: "asc" },
      take: 50,
    });
  }

  async findIdsByOrganizer(organizerId: string): Promise<string[]> {
    const rows = await this.prisma.event.findMany({ where: { organizerId }, select: { id: true } });
    return rows.map((r) => r.id);
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

  /**
   * Events starting in the [hoursBefore, hoursBefore + bandHours) window
   * from now that haven't had a reminder sent yet — polled by
   * notification-service's event-reminder loop
   * (internal/events/needing-reminder).
   */
  async findNeedingReminder(hoursBefore: number, bandHours: number) {
    const now = new Date();
    const from = new Date(now.getTime() + hoursBefore * 60 * 60 * 1000);
    const to = new Date(from.getTime() + bandHours * 60 * 60 * 1000);
    return this.prisma.event.findMany({
      where: {
        status: EventStatus.PUBLISHED,
        reminderSentAt: null,
        startTime: { gte: from, lt: to },
      },
    });
  }

  async markReminderSent(id: string): Promise<void> {
    await this.prisma.event.update({ where: { id }, data: { reminderSentAt: new Date() } });
  }

  /** Loads the event and throws unless `actor` owns it (or is an admin — see auth/manager.ts). */
  private async assertOwner(id: string, actor: Manager) {
    const event = await this.findById(id);
    if (!canManage(event.organizerId, actor)) {
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

/** End after start, at most MAX_EVENT_DAYS long, ticket sales closing by the time the event ends. */
function assertEventSchedule(start: Date, end: Date, salesEnd?: Date) {
  if (end.getTime() <= start.getTime()) {
    throw new BadRequestException("Thời gian kết thúc phải sau thời gian bắt đầu");
  }
  if (end.getTime() - start.getTime() > MAX_EVENT_DAYS * 86_400_000) {
    throw new BadRequestException(`Sự kiện kéo dài tối đa ${MAX_EVENT_DAYS} ngày`);
  }
  if (salesEnd && salesEnd.getTime() > end.getTime()) {
    throw new BadRequestException("Thời gian đóng bán vé không được sau thời gian kết thúc sự kiện");
  }
}
