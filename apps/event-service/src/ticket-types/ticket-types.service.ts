import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { canManage, Manager } from "../auth/manager";
import { eventCacheKey } from "../common/redis-keys";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { CreateTicketTypeDto } from "./dto/create-ticket-type.dto";
import { UpdateTicketTypeDto } from "./dto/update-ticket-type.dto";

@Injectable()
export class TicketTypesService {
  private readonly logger = new Logger(TicketTypesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async create(eventId: string, actor: Manager, dto: CreateTicketTypeDto) {
    await this.assertEventOwner(eventId, actor);
    const showtimes = await this.prisma.showtime.findMany({ where: { eventId }, select: { id: true } });
    if (showtimes.length > 0 && !showtimes.some((s) => s.id === dto.showtimeId)) {
      throw new BadRequestException("Sự kiện có nhiều suất diễn — chọn suất diễn cho hạng vé này");
    }
    if (showtimes.length === 0 && dto.showtimeId) {
      throw new BadRequestException("Suất diễn không thuộc sự kiện này");
    }
    assertOrderBounds(dto.minPerOrder ?? 1, dto.maxPerOrder ?? null);
    const created = await this.prisma.ticketType.create({ data: { ...dto, eventId } });
    await this.bustEventCache(eventId);
    return created;
  }

  async update(id: string, actor: Manager, dto: UpdateTicketTypeDto) {
    const ticketType = await this.prisma.ticketType.findUnique({ where: { id } });
    if (!ticketType) {
      throw new NotFoundException("Ticket type not found");
    }
    const event = await this.assertEventOwner(ticketType.eventId, actor);
    if (event.status === "CANCELED") {
      throw new BadRequestException("Sự kiện đã hủy, không thể sửa hạng vé");
    }
    if (dto.quantityTotal !== undefined && dto.quantityTotal < ticketType.quantitySold) {
      throw new BadRequestException(`Không thể giảm số lượng xuống dưới ${ticketType.quantitySold} vé đã bán`);
    }
    assertOrderBounds(
      dto.minPerOrder ?? ticketType.minPerOrder,
      dto.maxPerOrder !== undefined ? dto.maxPerOrder : ticketType.maxPerOrder,
    );
    const updated = await this.prisma.ticketType.update({ where: { id }, data: dto });
    // GET /events/:id embeds ticketTypes and is read-through cached — without
    // this, price/name/visibility edits stay invisible until the cache TTL.
    await this.bustEventCache(ticketType.eventId);
    return updated;
  }

  private async assertEventOwner(eventId: string, actor: Manager) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException("Event not found");
    }
    if (!canManage(event.organizerId, actor)) {
      throw new ForbiddenException("You do not own this event");
    }
    return event;
  }

  private async bustEventCache(eventId: string): Promise<void> {
    await this.redis.del(eventCacheKey(eventId)).catch((err) => {
      this.logger.warn(`Failed to bust event cache for ${eventId}: ${(err as Error).message}`);
    });
  }
}

function assertOrderBounds(min: number, max: number | null) {
  if (max !== null && max < min) {
    throw new BadRequestException(`Số vé tối đa mỗi đơn (${max}) không được nhỏ hơn số vé tối thiểu (${min})`);
  }
}
