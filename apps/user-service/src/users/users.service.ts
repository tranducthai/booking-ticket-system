import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { Prisma } from "../generated/prisma";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { PrismaService } from "../prisma/prisma.service";
import { SessionService } from "../sessions/session.service";
import { CreatePartnerDto } from "./dto/create-partner.dto";
import { UpdateMeDto } from "./dto/update-me.dto";

// Never select passwordHash into anything that leaves this service.
const PUBLIC_SELECT = {
  id: true,
  email: true,
  phone: true,
  fullName: true,
  avatarUrl: true,
  dateOfBirth: true,
  gender: true,
  role: true,
  isOrganizerVerified: true,
  isLocked: true,
  emailVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
    private readonly sessions: SessionService,
  ) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: PUBLIC_SELECT });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return user;
  }

  async updateMe(id: string, dto: UpdateMeDto) {
    const user = await this.prisma.user.update({ where: { id }, data: dto, select: PUBLIC_SELECT });
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

  /**
   * Admin onboards a partner organizer: the account is created already
   * ORGANIZER + verified, with an initial password the admin hands over.
   * Same bcrypt cost as self-registration (auth.service.ts).
   */
  async createPartner(dto: CreatePartnerDto, adminId: string) {
    const email = dto.email; // stored as typed, like self-registration — login matches it exactly
    if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new ConflictException("Email này đã được dùng cho một tài khoản khác");
    }
    const user = await this.prisma.user.create({
      data: {
        email,
        fullName: dto.fullName,
        phone: dto.phone,
        avatarUrl: dto.avatarUrl,
        passwordHash: await bcrypt.hash(dto.password, 10),
        role: "ORGANIZER",
        isOrganizerVerified: true,
      },
      select: PUBLIC_SELECT,
    });
    await this.activity.record({
      actorId: adminId,
      actorRole: "ADMIN",
      action: "user.partner_created",
      targetType: "user",
      targetId: user.id,
      subjectUserId: user.id,
      summary: `Tạo tài khoản đối tác ${user.fullName} (${user.email})`,
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
