import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { MembershipStatus } from "../generated/prisma";
import { Role } from "../auth/role";
import { PrismaService } from "../prisma/prisma.service";
import { CreateArtistPostDto } from "./dto/create-artist-post.dto";

interface Viewer {
  userId: string | null;
  role: Role | string | null;
}

/**
 * The social half of an artist's page (Ticketbox Stars style): followers,
 * the "Bài đăng" feed, and what the current viewer may do there. The catalog
 * half (profile, shows) stays in ArtistsService.
 */
@Injectable()
export class ArtistPageService {
  constructor(private readonly prisma: PrismaService) {}

  /** The viewer's relation to the artist — drives the Follow button, the post composer and members-only posts. */
  async viewerState(artistId: string, viewer: Viewer) {
    await this.assertArtist(artistId);
    if (!viewer.userId) return { following: false, isMember: false, canPost: false, canFollow: true };
    const [follow, isMember, canPost] = await Promise.all([
      this.prisma.artistFollow.findUnique({ where: { artistId_userId: { artistId, userId: viewer.userId } } }),
      this.isMember(artistId, viewer.userId),
      this.canPost(artistId, viewer),
    ]);
    return { following: !!follow, isMember, canPost, canFollow: viewer.role === Role.CUSTOMER };
  }

  /** Only ticket buyers (CUSTOMER accounts) follow artists — organizers and admins manage them instead. */
  async follow(artistId: string, viewer: Viewer) {
    if (viewer.role !== Role.CUSTOMER) throw new ForbiddenException("Chỉ người mua vé mới theo dõi được nghệ sĩ");
    const userId = viewer.userId!;
    await this.assertArtist(artistId);
    await this.prisma.artistFollow.upsert({
      where: { artistId_userId: { artistId, userId } },
      create: { artistId, userId },
      update: {},
    });
    return { following: true, followerCount: await this.prisma.artistFollow.count({ where: { artistId } }) };
  }

  async unfollow(artistId: string, userId: string) {
    await this.prisma.artistFollow.deleteMany({ where: { artistId, userId } });
    return { following: false, followerCount: await this.prisma.artistFollow.count({ where: { artistId } }) };
  }

  /** Newest first. A members-only post keeps its place in the feed but drops its content for non-members. */
  async listPosts(artistId: string, viewer: Viewer, page = 1, limit = 10) {
    await this.assertArtist(artistId);
    const [rows, total, member, manager] = await Promise.all([
      this.prisma.artistPost.findMany({ where: { artistId }, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      this.prisma.artistPost.count({ where: { artistId } }),
      viewer.userId ? this.isMember(artistId, viewer.userId) : false,
      viewer.userId ? this.canPost(artistId, viewer) : false,
    ]);
    const data = rows.map((p) => {
      const locked = p.membersOnly && !member && !manager;
      return { ...p, authorId: undefined, locked, content: locked ? null : p.content, imageUrl: locked ? null : p.imageUrl };
    });
    return { data, page, limit, total };
  }

  async createPost(artistId: string, viewer: Viewer, dto: CreateArtistPostDto) {
    await this.assertArtist(artistId);
    if (!(await this.canPost(artistId, viewer))) {
      throw new ForbiddenException("Chỉ quản trị viên hoặc ban tổ chức có nghệ sĩ trong lineup mới đăng bài được");
    }
    return this.prisma.artistPost.create({
      data: { artistId, authorId: viewer.userId!, content: dto.content, imageUrl: dto.imageUrl || null, membersOnly: dto.membersOnly ?? false },
    });
  }

  /** The author, or an admin. */
  async deletePost(artistId: string, postId: string, viewer: Viewer) {
    const post = await this.prisma.artistPost.findFirst({ where: { id: postId, artistId } });
    if (!post) throw new NotFoundException("Không tìm thấy bài đăng");
    if (viewer.role !== Role.ADMIN && post.authorId !== viewer.userId) throw new ForbiddenException("Bạn không thể xoá bài đăng này");
    await this.prisma.artistPost.delete({ where: { id: postId } });
    return { deleted: true };
  }

  /** Admins, or an organizer who has this artist in the lineup of one of their own events. */
  private async canPost(artistId: string, viewer: Viewer) {
    if (viewer.role === Role.ADMIN) return true;
    if (viewer.role !== Role.ORGANIZER || !viewer.userId) return false;
    const n = await this.prisma.eventArtist.count({ where: { artistId, event: { organizerId: viewer.userId } } });
    return n > 0;
  }

  private async isMember(artistId: string, userId: string) {
    const now = new Date();
    const n = await this.prisma.artistMembership.count({
      where: { artistId, userId, status: MembershipStatus.ACTIVE, startsAt: { lte: now }, expiresAt: { gt: now } },
    });
    return n > 0;
  }

  private async assertArtist(id: string) {
    const exists = await this.prisma.artist.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException("Artist not found");
  }
}
