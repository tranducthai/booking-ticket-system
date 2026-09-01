import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { EventStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateEventDto } from "./dto/create-event.dto";
import { RejectEventDto } from "./dto/reject-event.dto";
import { SearchEventsDto } from "./dto/search-events.dto";
import { UpdateEventDto } from "./dto/update-event.dto";

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: SearchEventsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.EventWhereInput = {
      status: EventStatus.PUBLISHED,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.keyword ? { title: { contains: query.keyword, mode: "insensitive" } } : {}),
      ...(query.location
        ? {
            OR: [
              { venueName: { contains: query.location, mode: "insensitive" } },
              { venueAddress: { contains: query.location, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        include: { category: true },
        orderBy: { startTime: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.event.count({ where }),
    ]);

    return { data, page, limit, total };
  }

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

  create(organizerId: string, dto: CreateEventDto) {
    return this.prisma.event.create({
      data: { ...dto, organizerId, status: EventStatus.DRAFT },
    });
  }

  async update(id: string, organizerId: string, dto: UpdateEventDto) {
    await this.assertOwner(id, organizerId);
    return this.prisma.event.update({ where: { id }, data: dto });
  }

  async submit(id: string, organizerId: string) {
    const event = await this.assertOwner(id, organizerId);
    if (event.status !== EventStatus.DRAFT && event.status !== EventStatus.REJECTED) {
      throw new BadRequestException(`Cannot submit an event in status ${event.status}`);
    }
    return this.prisma.event.update({
      where: { id },
      data: { status: EventStatus.PENDING_APPROVAL, rejectedReason: null },
    });
  }

  async approve(id: string) {
    const event = await this.findById(id);
    if (event.status !== EventStatus.PENDING_APPROVAL) {
      throw new BadRequestException(`Cannot approve an event in status ${event.status}`);
    }
    return this.prisma.event.update({ where: { id }, data: { status: EventStatus.PUBLISHED } });
  }

  async reject(id: string, dto: RejectEventDto) {
    const event = await this.findById(id);
    if (event.status !== EventStatus.PENDING_APPROVAL) {
      throw new BadRequestException(`Cannot reject an event in status ${event.status}`);
    }
    return this.prisma.event.update({
      where: { id },
      data: { status: EventStatus.REJECTED, rejectedReason: dto.reason },
    });
  }

  /** Loads the event and throws unless `organizerId` owns it. */
  private async assertOwner(id: string, organizerId: string) {
    const event = await this.findById(id);
    if (event.organizerId !== organizerId) {
      throw new ForbiddenException("You do not own this event");
    }
    return event;
  }
}
