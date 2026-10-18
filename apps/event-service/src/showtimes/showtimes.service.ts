import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { canManage, Manager } from "../auth/manager";
import { eventCacheKey } from "../common/redis-keys";
import { EventStatus, Prisma, TicketMode } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { CreateShowtimesDto } from "./dto/create-showtimes.dto";

/**
 * Performances of a multi-date event (schema.prisma Showtime). Each has its
 * own ticket types, so holds/orders/tickets keep working off ticketTypeId
 * unchanged — booking, payment and ticket services never learn showtimes exist.
 */
@Injectable()
export class ShowtimesService {
  private readonly logger = new Logger(ShowtimesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async create(eventId: string, actor: Manager, dto: CreateShowtimesDto) {
    const event = await this.assertManageable(eventId, actor);
    for (const slot of dto.items) {
      if (slot.endTime <= slot.startTime) throw new BadRequestException("Giờ kết thúc phải sau giờ bắt đầu");
    }

    const template = dto.copyTicketTypesFrom
      ? await this.prisma.showtime.findFirst({ where: { id: dto.copyTicketTypesFrom, eventId }, include: { ticketTypes: true } })
      : null;
    if (dto.copyTicketTypesFrom && !template) throw new BadRequestException("Suất mẫu không thuộc sự kiện này");

    const created = await this.prisma.$transaction(async (tx) => {
      // First showtime(s) on an event that already sells tiers without one: those tiers (and any
      // tickets already sold on them) belong to the event's original date — give that date a
      // showtime of its own so nothing sold silently moves to a new day.
      const existing = await tx.showtime.count({ where: { eventId } });
      if (existing === 0) {
        const unassigned = await tx.ticketType.count({ where: { eventId, showtimeId: null } });
        if (unassigned > 0) {
          const original = await tx.showtime.create({ data: { eventId, startTime: event.startTime, endTime: event.endTime } });
          await tx.ticketType.updateMany({ where: { eventId, showtimeId: null }, data: { showtimeId: original.id } });
        }
      }

      const rows = [];
      for (const slot of dto.items) {
        const showtime = await tx.showtime.create({ data: { eventId, startTime: slot.startTime, endTime: slot.endTime } });
        for (const t of template?.ticketTypes ?? []) {
          await tx.ticketType.create({
            data: {
              eventId,
              showtimeId: showtime.id,
              name: t.name,
              price: t.price,
              quantityTotal: t.quantityTotal,
              deliveryMethod: t.deliveryMethod,
              description: t.description,
              minPerOrder: t.minPerOrder,
              maxPerOrder: t.maxPerOrder,
              isHidden: t.isHidden,
            },
          });
        }
        rows.push(showtime);
      }
      await this.syncEventSpan(tx, eventId);
      return rows;
    });
    await this.bustEventCache(eventId);
    return created;
  }

  async remove(showtimeId: string, actor: Manager) {
    const showtime = await this.prisma.showtime.findUnique({ where: { id: showtimeId }, include: { ticketTypes: true } });
    if (!showtime) throw new NotFoundException("Showtime not found");
    await this.assertManageable(showtime.eventId, actor);
    if (showtime.ticketTypes.some((t) => t.quantitySold > 0)) {
      throw new BadRequestException("Suất diễn đã có vé được bán — không thể xóa. Hãy dời lịch hoặc hủy sự kiện.");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.ticketType.deleteMany({ where: { showtimeId } });
      await tx.showtime.delete({ where: { id: showtimeId } });
      await this.syncEventSpan(tx, showtime.eventId);
    });
    await this.bustEventCache(showtime.eventId);
    return { deleted: showtimeId };
  }

  /** Event.startTime/endTime = first start .. last end across its showtimes (left alone once none remain). */
  private async syncEventSpan(tx: Prisma.TransactionClient, eventId: string) {
    const span = await tx.showtime.aggregate({ where: { eventId }, _min: { startTime: true }, _max: { endTime: true } });
    if (span._min.startTime && span._max.endTime) {
      await tx.event.update({ where: { id: eventId }, data: { startTime: span._min.startTime, endTime: span._max.endTime } });
    }
  }

  private async assertManageable(eventId: string, actor: Manager) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException("Event not found");
    if (!canManage(event.organizerId, actor)) throw new ForbiddenException("You do not own this event");
    if (event.status === EventStatus.CANCELED) throw new BadRequestException("Sự kiện đã hủy");
    if (event.ticketMode !== TicketMode.GENERAL) {
      throw new BadRequestException("Lịch diễn nhiều suất chỉ áp dụng cho sự kiện bán theo hạng vé (không phải sơ đồ ghế)");
    }
    return event;
  }

  private async bustEventCache(eventId: string): Promise<void> {
    await this.redis.del(eventCacheKey(eventId)).catch((err) => {
      this.logger.warn(`Failed to bust event cache for ${eventId}: ${(err as Error).message}`);
    });
  }
}
