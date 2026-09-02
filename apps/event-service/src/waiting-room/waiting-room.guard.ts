import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { WaitingRoomService } from "./waiting-room.service";

/**
 * "Locked" (423) rather than a plain 403 — this isn't a permissions
 * failure, it's "come back after joining the queue". The body carries
 * enough for apps/web to render the waiting-room page directly instead of
 * a generic error state.
 */
export class WaitingRoomLockedException extends HttpException {
  constructor(eventId: string, position?: number, queueLength?: number) {
    super({ statusCode: 423, error: "WaitingRoom", message: "This event is in high demand — join the waiting room", eventId, position, queueLength }, HttpStatus.LOCKED);
  }
}

/**
 * Applied to the event-detail and seat-map-state routes (docs/spec/11-implementation-roadmap.md
 * Phase 8b "gates the event-page routes, not only checkout"). A no-op for
 * the vast majority of events (highDemand defaults false); reads that flag
 * fresh (not through EventsService's cache) since it's the one field this
 * guard can't afford to see stale — a delayed cache flip would let a burst
 * through the very queue meant to stop it.
 */
@Injectable()
export class WaitingRoomGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly waitingRoom: WaitingRoomService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const eventId: string | undefined = request.params.eventId ?? request.params.id;
    if (!eventId) return true;

    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { highDemand: true } });
    if (!event?.highDemand) return true;

    const sessionId = (request.headers["x-queue-session"] as string | undefined) ?? (request.query.queueSession as string | undefined);
    if (!sessionId) {
      throw new WaitingRoomLockedException(eventId);
    }

    const admitted = await this.waitingRoom.isAdmitted(eventId, sessionId);
    if (!admitted) {
      const status = await this.waitingRoom.status(eventId, sessionId);
      throw new WaitingRoomLockedException(eventId, status.position, status.queueLength);
    }
    return true;
  }
}
