import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { SeatStatus } from "@prisma/client";
import { seatHoldKey } from "../common/redis-keys";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { CreateSeatMapDto } from "./dto/create-seat-map.dto";
import { rowLabel } from "./row-label";

@Injectable()
export class SeatMapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async createOrReplace(eventId: string, organizerId: string, dto: CreateSeatMapDto) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException("Event not found");
    }
    if (event.organizerId !== organizerId) {
      throw new ForbiddenException("You do not own this event");
    }

    return this.prisma.$transaction(async (tx) => {
      const seatMap = await tx.seatMap.upsert({
        where: { eventId },
        create: { eventId },
        update: {},
      });

      // Replace: wipe existing zones (cascades to seats) then rebuild from the request.
      await tx.seatZone.deleteMany({ where: { seatMapId: seatMap.id } });

      for (const zoneDto of dto.zones) {
        const zone = await tx.seatZone.create({
          data: {
            seatMapId: seatMap.id,
            name: zoneDto.name,
            price: zoneDto.price,
            isGeneral: zoneDto.isGeneral ?? false,
            capacity: zoneDto.isGeneral ? zoneDto.capacity : null,
          },
        });

        if (!zoneDto.isGeneral) {
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
        where: { id: seatMap.id },
        include: { zones: { include: { seats: true } } },
      });
    });
  }

  async getSeatMap(eventId: string) {
    const seatMap = await this.prisma.seatMap.findUnique({
      where: { eventId },
      include: { zones: { include: { seats: true } } },
    });
    if (!seatMap) {
      throw new NotFoundException("This event has no seat map");
    }

    await this.healStaleHolds(seatMap.zones.flatMap((z) => z.seats));
    return seatMap;
  }

  /**
   * Seat.status = HELD is a read-optimized projection; Redis's TTL is the
   * actual source of truth for whether a hold is still live (see
   * docs/spec/07-database-schema.md §2 "Note on SEAT_HOLDS"). A hold that
   * expired without an explicit release/confirm call leaves the seat
   * looking HELD in Postgres forever, so every read here double-checks
   * Redis for seats that still say HELD and self-heals any that lapsed.
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

  async blockSeat(seatId: string, organizerId: string) {
    const seat = await this.prisma.seat.findUnique({
      where: { id: seatId },
      include: { zone: { include: { seatMap: { include: { event: true } } } } },
    });
    if (!seat) {
      throw new NotFoundException("Seat not found");
    }
    if (seat.zone.seatMap.event.organizerId !== organizerId) {
      throw new ForbiddenException("You do not own this event");
    }
    if (seat.status !== SeatStatus.AVAILABLE && seat.status !== SeatStatus.BLOCKED) {
      throw new BadRequestException(`Cannot block a seat that is currently ${seat.status}`);
    }
    return this.prisma.seat.update({ where: { id: seatId }, data: { status: SeatStatus.BLOCKED } });
  }
}
