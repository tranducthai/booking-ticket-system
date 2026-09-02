import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { EventStatus } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { SeatMapService } from "./seat-map.service";

/**
 * docs/spec/11-implementation-roadmap.md Phase 8b: "SeatSnapshotJob — per
 * active event, 1s tick: rebuild seatmap:state:{eventId} from Redis holds +
 * booked-set, compute the diff, emit one batched seat:batch WS frame per
 * room". This tick does the rebuild half every second; it does NOT do the
 * "compute diff + emit one WS frame" half — apps/web's default is polling
 * GET .../seat-map/state (matches this same 1s-fresh data), and no
 * consumer of a WS diff exists in this codebase yet, so emitting one would
 * be unverifiable dead code. seat-map.gateway.ts's existing
 * broadcastSeatUpdate (fired per-seat from holds.service.ts on every
 * hold/release/confirm) is intentionally left as the interim realtime path
 * — see HoldsService's per-call broadcast — until an actual WS consumer
 * exists to justify batching it.
 *
 * Scoped to PUBLISHED events only — a DRAFT/PENDING_APPROVAL/REJECTED
 * event's seat map has no customer traffic reading it, so ticking it here
 * every second would be pure waste. A real deployment would narrow this
 * further to events currently on sale (salesStartTime/salesEndTime window)
 * rather than every published event ever.
 */
@Injectable()
export class SeatSnapshotJob {
  private readonly logger = new Logger(SeatSnapshotJob.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly seatMapService: SeatMapService,
  ) {}

  @Interval(1000)
  async tick(): Promise<void> {
    if (this.running) return; // don't overlap ticks if a rebuild pass ever runs long
    this.running = true;
    try {
      const events = await this.prisma.event.findMany({
        where: { status: EventStatus.PUBLISHED, seatMap: { isNot: null } },
        select: { id: true },
      });
      for (const event of events) {
        try {
          await this.seatMapService.rebuildStateSnapshot(event.id);
        } catch (err) {
          this.logger.error(`Snapshot rebuild failed for event ${event.id}: ${(err as Error).message}`);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
