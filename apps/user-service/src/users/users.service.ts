import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../generated/prisma";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { PrismaService } from "../prisma/prisma.service";
import { SessionService } from "../sessions/session.service";
import { UpdateMeDto } from "./dto/update-me.dto";
import { UpdatePartnerDto } from "./dto/update-partner.dto";

// Never select passwordHash into anything that leaves this service.
const PUBLIC_SELECT = {
  id: true,
  email: true,
  phone: true,
  fullName: true,
  avatarUrl: true,
  dateOfBirth: true,
  gender: true,
  organizerDescription: true,
  role: true,
  isOrganizerVerified: true,
  isLocked: true,
  emailVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

// The owner's own view (GET /users/me) and the internal lookup: also carries the CCCD, which admin listings do not.
const SELF_SELECT = { ...PUBLIC_SELECT, nationalId: true } as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
    private readonly sessions: SessionService,
  ) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: SELF_SELECT });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return user;
  }

  async updateMe(id: string, dto: UpdateMeDto) {
    let user;
    try {
      user = await this.prisma.user.update({ where: { id }, data: dto, select: SELF_SELECT });
    } catch (err) {
      // phone is unique: saving a number another account already uses is the user's mistake, not a server fault.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Số điện thoại này đã được dùng bởi tài khoản khác");
      }
      throw err;
    }
    // Field NAMES only — the values (phone, name) are personal data the log doesn't need.
    await this.activity.record({
      actorId: id,
      action: "user.profile_updated",
      targetType: "user",
      targetId: id,
      subjectUserId: id,
      summary: "Cập nhật thông tin cá nhân",
      metadata: { fields: Object.keys(dto) },
    });
    return user;
  }

  /** docs/spec/08-api-contracts.md §1 "GET /users | admin". Not implemented in Phase 1 — added alongside the admin frontend panel (Phase 7b). */
  async listForAdmin(page: number, limit: number, role?: "CUSTOMER" | "ORGANIZER" | "ADMIN", q?: string) {
    const term = q?.trim();
    const where: Prisma.UserWhereInput = {
      ...(role ? { role } : {}),
      ...(term
        ? {
            OR: [
              { email: { contains: term, mode: "insensitive" } },
              { fullName: { contains: term, mode: "insensitive" } },
              { phone: { contains: term } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: PUBLIC_SELECT,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data, page, limit, total };
  }

  async setLocked(id: string, isLocked: boolean, adminId: string) {
    const user = await this.prisma.user.update({ where: { id }, data: { isLocked }, select: PUBLIC_SELECT });
    // A lock takes effect now, not when the user's access token happens to expire.
    if (isLocked) await this.sessions.revokeAllForUser(id, "locked");
    await this.activity.record({
      actorId: adminId,
      actorRole: "ADMIN",
      action: isLocked ? "user.locked" : "user.unlocked",
      targetType: "user",
      targetId: id,
      subjectUserId: id,
      summary: `${isLocked ? "Khóa" : "Mở khóa"} tài khoản ${user.email}`,
    });
    return user;
  }

  /** Admin edits a partner organizer's contact info. Only ORGANIZER accounts — other roles manage their own profile. */
  async updatePartner(id: string, dto: UpdatePartnerDto, adminId: string) {
    const target = await this.prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!target || target.role !== "ORGANIZER") throw new NotFoundException("Partner not found");
    const user = await this.prisma.user.update({ where: { id }, data: dto, select: PUBLIC_SELECT });
    await this.activity.record({
      actorId: adminId,
      actorRole: "ADMIN",
      action: "user.partner_updated",
      targetType: "user",
      targetId: id,
      subjectUserId: id,
      summary: `Sửa thông tin đối tác ${user.fullName} (${user.email})`,
      metadata: { fields: Object.keys(dto) },
    });
    return user;
  }

  async verifyOrganizer(id: string, adminId: string) {
    const user = await this.prisma.user.update({
      where: { id },
      data: { role: "ORGANIZER", isOrganizerVerified: true },
      select: PUBLIC_SELECT,
    });
    await this.activity.record({
      actorId: adminId,
      actorRole: "ADMIN",
      action: "user.organizer_verified",
      targetType: "user",
      targetId: id,
      subjectUserId: id,
      summary: `Xác minh ban tổ chức ${user.email}`,
    });
    return user;
  }
}
