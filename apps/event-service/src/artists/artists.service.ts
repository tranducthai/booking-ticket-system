import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { canManage, Manager } from "../auth/manager";
import { ArtistStatus, EventStatus, Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { CreateArtistDto } from "./dto/create-artist.dto";
import { ListArtistsDto } from "./dto/list-artists.dto";
import { UpdateArtistDto } from "./dto/update-artist.dto";
import { RejectArtistDto } from "./dto/reject-artist.dto";

@Injectable()
export class ArtistsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Any organizer can add a new artist — this is a shared directory (like Category). `isVerified` always starts false; only an admin can flip it (verify()). The creator is remembered so they can manage it. */
  create(dto: CreateArtistDto, actor: Manager) {
    // An organizer's artist is a request to the admins (PENDING); an admin's is approved on the spot.
    const admin = canManage("", actor);
    return this.prisma.artist.create({
      data: { ...dto, createdById: actor.userId, status: admin ? ArtistStatus.APPROVED : ArtistStatus.PENDING, isVerified: admin ? true : false },
    });
  }

  /** Admin queue: artists waiting for approval, oldest first. */
  async listPending(page = 1, limit = 20) {
    const where = { status: ArtistStatus.PENDING };
    const [data, total] = await Promise.all([
      this.prisma.artist.findMany({ where, orderBy: { createdAt: "asc" }, skip: (page - 1) * limit, take: limit }),
      this.prisma.artist.count({ where }),
    ]);
    return { data, page, limit, total };
  }

  async approve(id: string) {
    await this.findById(id, { userId: "", role: "ADMIN" });
    return this.prisma.artist.update({ where: { id }, data: { status: ArtistStatus.APPROVED, isVerified: true, rejectedReason: null } });
  }

  async reject(id: string, dto: RejectArtistDto) {
    await this.findById(id, { userId: "", role: "ADMIN" });
    return this.prisma.artist.update({ where: { id }, data: { status: ArtistStatus.REJECTED, isVerified: false, rejectedReason: dto.reason } });
  }

  /**
   * "Quản lý nghệ sĩ" for an organizer: the artists they created plus every
   * artist in the lineup of one of their events. `canEdit` = they created it
   * and an admin hasn't approved it yet (after that, it is a shared record).
   */
  async listMine(actor: Manager) {
    const mine = { event: { organizerId: actor.userId } };
    const rows = await this.prisma.artist.findMany({
      where: { OR: [{ createdById: actor.userId }, { events: { some: mine } }] },
      include: { events: { where: mine, select: { eventId: true } }, _count: { select: { follows: true } } },
      orderBy: { name: "asc" },
    });
    return rows.map(({ events, _count, ...artist }) => ({
      ...artist,
      eventCount: events.length,
      followerCount: _count.follows,
      canEdit: artist.createdById === actor.userId && artist.status !== ArtistStatus.APPROVED,
    }));
  }

  async search(query: ListArtistsDto, actor?: Manager) {
    const where: Prisma.ArtistWhereInput = canManage("", actor ?? { userId: "" }) ? {} : { status: ArtistStatus.APPROVED };
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

  async findById(id: string, actor?: Manager) {
    const artist = await this.prisma.artist.findUnique({ where: { id }, include: { membershipPlan: true } });
    if (!artist) {
      throw new NotFoundException("Artist not found");
    }
    if (artist.status !== ArtistStatus.APPROVED && !(actor && (canManage("", actor) || artist.createdById === actor.userId))) {
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

  /** Admin: any artist. Organizer: only one they created that an admin hasn't approved; editing a rejected one sends it back for review. */
  async update(id: string, dto: UpdateArtistDto, actor: Manager) {
    const artist = await this.prisma.artist.findUnique({ where: { id }, select: { createdById: true, status: true } });
    if (!artist) throw new NotFoundException("Artist not found");
    const admin = canManage("", actor);
    if (!admin && !(artist.createdById === actor.userId && artist.status !== ArtistStatus.APPROVED)) {
      throw new ForbiddenException(artist.status === ArtistStatus.APPROVED ? "Nghệ sĩ đã được duyệt — liên hệ quản trị viên để chỉnh sửa" : "Bạn chỉ sửa được nghệ sĩ do mình tạo");
    }
    const resubmit = !admin && artist.status === ArtistStatus.REJECTED;
    return this.prisma.artist.update({ where: { id }, data: { ...dto, ...(resubmit ? { status: ArtistStatus.PENDING, rejectedReason: null } : {}) } });
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
    if (artist.status !== ArtistStatus.APPROVED) {
      throw new ForbiddenException(
        artist.status === ArtistStatus.PENDING ? "Nghệ sĩ đang chờ quản trị viên duyệt — thêm vào sự kiện sau khi được duyệt" : "Nghệ sĩ này đã bị từ chối nên không thể thêm vào sự kiện",
      );
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
