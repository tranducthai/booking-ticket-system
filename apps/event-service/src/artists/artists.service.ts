import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { canManage, Manager } from "../auth/manager";
import { EventStatus, Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { CreateArtistDto } from "./dto/create-artist.dto";
import { ListArtistsDto } from "./dto/list-artists.dto";
import { UpdateArtistDto } from "./dto/update-artist.dto";

@Injectable()
export class ArtistsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Any organizer can add a new artist — this is a shared directory (like Category), not owned by whoever created the record. `isVerified` always starts false; only an admin can flip it (verify()). */
  create(dto: CreateArtistDto) {
    return this.prisma.artist.create({ data: dto });
  }

  async search(query: ListArtistsDto) {
    const where: Prisma.ArtistWhereInput = {};
    if (query.q) where.name = { contains: query.q, mode: "insensitive" };
    if (query.verified !== undefined) where.isVerified = query.verified === "true";

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [data, total] = await Promise.all([
      this.prisma.artist.findMany({
        where,
        orderBy: query.verified === "true" ? { updatedAt: "desc" } : { name: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.artist.count({ where }),
    ]);
    return { data, page, limit, total };
  }

  async findById(id: string) {
    const artist = await this.prisma.artist.findUnique({ where: { id }, include: { membershipPlan: true } });
    if (!artist) {
      throw new NotFoundException("Artist not found");
    }
    // "Lịch diễn": upcoming shows, plus the most recent past ones (sold/held events stay PUBLISHED).
    const now = new Date();
    const lineup = { status: EventStatus.PUBLISHED, lineup: { some: { artistId: id } } };
    const [upcomingEvents, pastEvents, followerCount, postCount] = await Promise.all([
      this.prisma.event.findMany({ where: { ...lineup, endTime: { gte: now } }, include: { category: true }, orderBy: { startTime: "asc" }, take: 20 }),
      this.prisma.event.findMany({ where: { ...lineup, endTime: { lt: now } }, include: { category: true }, orderBy: { startTime: "desc" }, take: 12 }),
      this.prisma.artistFollow.count({ where: { artistId: id } }),
      this.prisma.artistPost.count({ where: { artistId: id } }),
    ]);
    return { ...artist, upcomingEvents, pastEvents, followerCount, postCount };
  }

  async update(id: string, dto: UpdateArtistDto) {
    await this.findById(id);
    return this.prisma.artist.update({ where: { id }, data: dto });
  }

  async verify(id: string, verified: boolean) {
    await this.findById(id);
    return this.prisma.artist.update({ where: { id }, data: { isVerified: verified } });
  }

  /** Appends to the end of the lineup — see EventArtist's doc comment on why there's no reorder endpoint yet. */
  async attachToEvent(eventId: string, artistId: string, actor: Manager) {
    await this.assertEventOwner(eventId, actor);
    const artist = await this.prisma.artist.findUnique({ where: { id: artistId } });
    if (!artist) {
      throw new NotFoundException("Artist not found");
    }
    const maxOrder = await this.prisma.eventArtist.aggregate({ where: { eventId }, _max: { order: true } });
    return this.prisma.eventArtist.upsert({
      where: { eventId_artistId: { eventId, artistId } },
      create: { eventId, artistId, order: (maxOrder._max.order ?? -1) + 1 },
      update: {},
      include: { artist: true },
    });
  }

  async detachFromEvent(eventId: string, artistId: string, actor: Manager) {
    await this.assertEventOwner(eventId, actor);
    await this.prisma.eventArtist.deleteMany({ where: { eventId, artistId } });
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
}
