import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { canManage, Manager } from "../auth/manager";
import { SeatStatus } from "../generated/prisma";
import { eventCacheKey, seatHoldKey, seatMapLayoutKey, seatMapStateKey } from "../common/redis-keys";
import { SingleFlight } from "../common/single-flight";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { CreateSeatMapDto } from "./dto/create-seat-map.dto";
import { rowLabel } from "./row-label";

const LAYOUT_CACHE_TTL_SECONDS = 3600; // structure is immutable between createOrReplace calls — long TTL + explicit bust
const STATE_SNAPSHOT_TTL_SECONDS = 30; // safety net if SeatSnapshotJob stops ticking — state.ts still expires rather than serving something ancient

export interface SeatMapLayout {
  id: string;
  eventId: string;
  /** null for maps built before the hall designer (zones stacked as plain row x seat blocks). */
  canvas: { rows: number; cols: number; stageLabel: string } | null;
  zones: Array<{
    id: string;
    name: string;
    price: string;
    isGeneral: boolean;
    capacity: number | null;
    color: string | null;
    /** Standing zones: the ticket type buyers hold by quantity (null for seated zones). */
    ticketTypeId: string | null;
    seats: Array<{ id: string; row: string; number: string; gridRow: number | null; gridCol: number | null }>;
  }>;
}

const MAX_CANVAS_SEATS = 5000;

/**
 * Cinema-style labels for a drawn hall: row letters count only grid rows that
 * have seats (A = nearest the stage), seat numbers run left to right within a
 * row across zones, skipping aisles — so an aisle never leaves a gap in the
 * numbering and a zone boundary doesn't restart it.
 */
export function labelCanvasSeats(cells: Array<{ zone: number; r: number; c: number }>, rowLabels: string[] = []) {
  const rows = [...new Set(cells.map((x) => x.r))].sort((a, b) => a - b);
  // `rowLabels` (by grid row) override the automatic letter, for halls that don't letter A, B, C... in order.
  const letter = new Map(rows.map((r, i) => [r, rowLabels[r] ?? rowLabel(i)]));
  if (new Set(letter.values()).size !== letter.size) throw new BadRequestException("Hai hàng ghế không được trùng nhãn");
  const byRow = new Map<number, Array<{ zone: number; r: number; c: number }>>();
  for (const cell of cells) {
    if (!byRow.has(cell.r)) byRow.set(cell.r, []);
    byRow.get(cell.r)!.push(cell);
  }
  const out: Array<{ zone: number; r: number; c: number; row: string; number: string }> = [];
  for (const [r, rowCells] of byRow) {
    rowCells.sort((a, b) => a.c - b.c).forEach((cell, i) => out.push({ ...cell, row: letter.get(r)!, number: String(i + 1) }));
  }
  return out;
}

export type SeatMapState = Record<string, SeatStatus>; // seatId -> status

@Injectable()
export class SeatMapService {
  private readonly logger = new Logger(SeatMapService.name);
  private readonly singleFlight = new SingleFlight();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly activity: ActivityLogService,
  ) {}

  async createOrReplace(eventId: string, actor: Manager, dto: CreateSeatMapDto) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException("Event not found");
    }
    if (!canManage(event.organizerId, actor)) {
      throw new ForbiddenException("You do not own this event");
    }
    if (event.ticketMode !== "SEATMAP") {
      throw new BadRequestException("Chỉ sự kiện chọn chỗ trên sơ đồ mới có sơ đồ ghế");
    }

    // Replacing rebuilds every seat with a new id — orders and holds point at
    // the old ids, so once any seat is held or sold the map is frozen.
    const taken = await this.prisma.seat.count({ where: { zone: { seatMap: { eventId } }, status: { in: [SeatStatus.HELD, SeatStatus.BOOKED] } } });
    if (taken > 0) {
      throw new BadRequestException(`Không thể thay sơ đồ: đã có ${taken} ghế đang được giữ hoặc đã bán`);
    }
    const standingSold = await this.prisma.ticketType.count({ where: { eventId, seatZoneId: { not: null }, quantitySold: { gt: 0 } } });
    if (standingSold > 0) {
      throw new BadRequestException("Không thể thay sơ đồ: khu đứng đã có vé được giữ hoặc đã bán");
    }

    // Canvas mode: validate every cell once, up front, and label the seats.
    const canvas = dto.canvas;
    let canvasSeats: ReturnType<typeof labelCanvasSeats> = [];
    if (canvas) {
      const used = new Set<string>();
      const cells: Array<{ zone: number; r: number; c: number }> = [];
      dto.zones.forEach((zone, zi) => {
        if (zone.isGeneral) return;
        for (const cell of zone.cells ?? []) {
          if (cell.r >= canvas.rows || cell.c >= canvas.cols) {
            throw new BadRequestException(`Ghế (${cell.r},${cell.c}) của khu "${zone.name}" nằm ngoài sơ đồ ${canvas.rows}x${canvas.cols}`);
          }
          const key = `${cell.r}:${cell.c}`;
          if (used.has(key)) throw new BadRequestException(`Ô (${cell.r},${cell.c}) được gán cho hai khu`);
          used.add(key);
          cells.push({ zone: zi, r: cell.r, c: cell.c });
        }
      });
      if (cells.length > MAX_CANVAS_SEATS) throw new BadRequestException(`Sơ đồ tối đa ${MAX_CANVAS_SEATS} ghế`);
      canvasSeats = labelCanvasSeats(cells, canvas.rowLabels);
    }

    const seatMap = await this.prisma.$transaction(async (tx) => {
      const created = await tx.seatMap.upsert({
        where: { eventId },
        create: { eventId, gridRows: canvas?.rows ?? null, gridCols: canvas?.cols ?? null, stageLabel: canvas ? canvas.stageLabel?.trim() || "SÂN KHẤU" : null },
        update: { gridRows: canvas?.rows ?? null, gridCols: canvas?.cols ?? null, stageLabel: canvas ? canvas.stageLabel?.trim() || "SÂN KHẤU" : null },
      });

      // Replace: wipe existing zones (cascades to seats) and the standing
      // zones' tiers (none sold — checked above), then rebuild from the request.
      await tx.ticketType.deleteMany({ where: { eventId, seatZoneId: { not: null } } });
      await tx.seatZone.deleteMany({ where: { seatMapId: created.id } });

      for (const [zi, zoneDto] of dto.zones.entries()) {
        const zone = await tx.seatZone.create({
          data: {
            seatMapId: created.id,
            name: zoneDto.name,
            price: zoneDto.price,
            isGeneral: zoneDto.isGeneral ?? false,
            capacity: zoneDto.isGeneral ? zoneDto.capacity : null,
            color: zoneDto.color ?? null,
          },
        });

        if (zoneDto.isGeneral) {
          if (!zoneDto.capacity) throw new BadRequestException(`Khu đứng "${zoneDto.name}" cần có sức chứa`);
          await tx.ticketType.create({
            data: {
              eventId,
              name: zoneDto.name,
              price: zoneDto.price,
              quantityTotal: zoneDto.capacity,
              description: "Khu đứng tự do — không có số ghế.",
              seatZoneId: zone.id,
            },
          });
        }

        if (canvas && !zoneDto.isGeneral) {
          const seats = canvasSeats
            .filter((s) => s.zone === zi)
            .map((s) => ({ zoneId: zone.id, row: s.row, number: s.number, gridRow: s.r, gridCol: s.c }));
          if (seats.length === 0) throw new BadRequestException(`Khu "${zoneDto.name}" chưa có ghế nào trên sơ đồ`);
          await tx.seat.createMany({ data: seats });
        } else if (!zoneDto.isGeneral) {
          if (!zoneDto.rows || !zoneDto.seatsPerRow) {
            throw new BadRequestException(`Zone "${zoneDto.name}" needs rows and seatsPerRow, or isGeneral: true`);
          }
          const seats = [];
          for (let r = 0; r < zoneDto.rows; r++) {
            for (let n = 1; n <= zoneDto.seatsPerRow; n++) {
              seats.push({ zoneId: zone.id, row: rowLabel(r), number: String(n) });
            }
          }
          await tx.seat.createMany({ data: seats });
        }
      }

      return tx.seatMap.findUnique({
        where: { id: created.id },
        include: { zones: { include: { seats: true } } },
      });
    });

    // Structure changed (seat IDs are entirely new) — the old layout cache
    // and state snapshot are both meaningless now.
    // The event body's cached ticketTypes list changed too (standing-zone tiers).
    await this.redis.del(seatMapLayoutKey(eventId), seatMapStateKey(eventId), eventCacheKey(eventId)).catch(() => undefined);
    await this.rebuildStateSnapshot(eventId).catch((err) => {
      this.logger.warn(`Failed to rebuild state snapshot for ${eventId} after createOrReplace: ${(err as Error).message}`);
    });

    return seatMap;
  }

  /**
   * docs/spec/11-implementation-roadmap.md Phase 8b: split getSeatMap into
   * layout (this — cached, immutable structure) + state (below — volatile,
   * Redis-only). Read-through cached at LAYOUT_CACHE_TTL_SECONDS, busted
   * explicitly on createOrReplace since that's the only thing that changes
   * seat IDs/zones/prices.
   */
  async getLayout(eventId: string): Promise<SeatMapLayout> {
    const cacheKey = seatMapLayoutKey(eventId);
    const cached = await this.redis.get(cacheKey).catch(() => null);
    if (cached) return JSON.parse(cached);

    // single-flight (docs/spec/12-resilience-and-failure-design.md "cache
    // stampede guard") — same rationale as events.service.ts findByIdCached.
    return this.singleFlight.run(cacheKey, async () => {
      const cachedAgain = await this.redis.get(cacheKey).catch(() => null);
      if (cachedAgain) return JSON.parse(cachedAgain);

      const seatMap = await this.prisma.seatMap.findUnique({
        where: { eventId },
        include: { zones: { include: { seats: true, ticketType: { select: { id: true } } } } },
      });
      if (!seatMap) {
        throw new NotFoundException("This event has no seat map");
      }

      const layout: SeatMapLayout = {
        id: seatMap.id,
        eventId: seatMap.eventId,
        canvas:
          seatMap.gridRows && seatMap.gridCols
            ? { rows: seatMap.gridRows, cols: seatMap.gridCols, stageLabel: seatMap.stageLabel ?? "SÂN KHẤU" }
            : null,
        zones: seatMap.zones.map((z) => ({
          id: z.id,
          name: z.name,
          price: z.price.toString(),
          isGeneral: z.isGeneral,
          capacity: z.capacity,
          color: z.color,
          ticketTypeId: z.ticketType?.id ?? null,
          seats: z.seats.map((s) => ({ id: s.id, row: s.row, number: s.number, gridRow: s.gridRow, gridCol: s.gridCol })),
        })),
      };
      await this.redis.set(cacheKey, JSON.stringify(layout), "EX", LAYOUT_CACHE_TTL_SECONDS).catch((err) => {
        this.logger.warn(`Failed to cache seat-map layout for ${eventId}: ${(err as Error).message}`);
      });
      return layout;
    });
  }

  /**
   * docs/spec/11-implementation-roadmap.md Phase 8b: "getSeatMapState
   * (reads the Redis snapshot only)" — no Postgres access on this path at
   * all in the common case. SeatSnapshotJob (seat-snapshot.job.ts) is what
   * actually keeps seatmap:state:{eventId} fresh, ticking every second for
   * every PUBLISHED event with a seat map; this just reads whatever it last
   * wrote. Falls back to building the snapshot inline only when none exists
   * yet at all (service just started, or this event's first-ever read),
   * which is the one case a real Postgres read still happens here.
   */
  async getState(eventId: string): Promise<SeatMapState> {
    const cached = await this.redis.get(seatMapStateKey(eventId)).catch(() => null);
    if (cached) return JSON.parse(cached);
    return this.rebuildStateSnapshot(eventId);
  }

  /** Also called directly by SeatSnapshotJob on its tick — see that file. */
  async rebuildStateSnapshot(eventId: string): Promise<SeatMapState> {
    const seats = await this.prisma.seat.findMany({
      where: { zone: { seatMap: { eventId } } },
      select: { id: true, status: true },
    });
    if (seats.length === 0) return {};

    await this.healStaleHolds(seats);

    const state: SeatMapState = {};
    for (const seat of seats) state[seat.id] = seat.status;

    await this.redis
      .set(seatMapStateKey(eventId), JSON.stringify(state), "EX", STATE_SNAPSHOT_TTL_SECONDS)
      .catch((err) => this.logger.warn(`Failed to write state snapshot for ${eventId}: ${(err as Error).message}`));
    return state;
  }

  /**
   * Seat.status = HELD is a read-optimized projection; Redis's TTL is the
   * actual source of truth for whether a hold is still live (see
   * docs/spec/07-database-schema.md §2 "Note on SEAT_HOLDS"). A hold that
   * expired without an explicit release/confirm call leaves the seat
   * looking HELD in Postgres forever, so every snapshot rebuild
   * double-checks Redis for seats that still say HELD and self-heals any
   * that lapsed. StaleHoldSweeper (stale-hold-sweeper.service.ts) also
   * reconciles this independently on its own slower schedule, so a seat
   * gets corrected here even for events with light read traffic (no one
   * calling getState -> no rebuildStateSnapshot -> this never runs) as
   * long as the sweeper is running.
   */
  private async healStaleHolds(seats: { id: string; status: SeatStatus }[]) {
    const heldSeats = seats.filter((s) => s.status === SeatStatus.HELD);
    if (heldSeats.length === 0) return;

    const pipeline = this.redis.pipeline();
    for (const seat of heldSeats) {
      pipeline.exists(seatHoldKey(seat.id));
    }
    const results = await pipeline.exec();

    const staleIds: string[] = [];
    heldSeats.forEach((seat, i) => {
      const stillLocked = results?.[i]?.[1] === 1;
      if (!stillLocked) {
        seat.status = SeatStatus.AVAILABLE; // correct the in-memory response immediately
        staleIds.push(seat.id);
      }
    });

    if (staleIds.length > 0) {
      await this.prisma.seat.updateMany({
        where: { id: { in: staleIds } },
        data: { status: SeatStatus.AVAILABLE },
      });
    }
  }

  async blockSeat(seatId: string, actor: Manager) {
    const seat = await this.prisma.seat.findUnique({
      where: { id: seatId },
      include: { zone: { include: { seatMap: { include: { event: true } } } } },
    });
    if (!seat) {
      throw new NotFoundException("Seat not found");
    }
    if (!canManage(seat.zone.seatMap.event.organizerId, actor)) {
      throw new ForbiddenException("You do not own this event");
    }
    if (seat.status !== SeatStatus.AVAILABLE && seat.status !== SeatStatus.BLOCKED) {
      throw new BadRequestException(`Cannot block a seat that is currently ${seat.status}`);
    }
    const updated = await this.prisma.seat.update({ where: { id: seatId }, data: { status: SeatStatus.BLOCKED } });
    // Best-effort immediate patch — SeatSnapshotJob's next tick (<=1s) would
    // fix this anyway, but blocking a seat is rare enough that patching the
    // one key directly is cheap and gives an instant-feeling update.
    await this.patchStateSnapshot(seat.zone.seatMap.eventId, seatId, SeatStatus.BLOCKED);
    await this.activity.record({
      action: "seat.blocked",
      targetType: "seat",
      targetId: seatId,
      eventId: seat.zone.seatMap.eventId,
      summary: `Khóa ghế ${seat.row}${seat.number} (${seat.zone.name})`,
    });
    return updated;
  }

  private async patchStateSnapshot(eventId: string, seatId: string, status: SeatStatus): Promise<void> {
    try {
      const raw = await this.redis.get(seatMapStateKey(eventId));
      if (!raw) return; // no snapshot to patch — next rebuild will have the right value from Postgres anyway
      const state: SeatMapState = JSON.parse(raw);
      state[seatId] = status;
      await this.redis.set(seatMapStateKey(eventId), JSON.stringify(state), "EX", STATE_SNAPSHOT_TTL_SECONDS);
    } catch (err) {
      this.logger.warn(`Failed to patch state snapshot for ${eventId}/${seatId}: ${(err as Error).message}`);
    }
  }
}
