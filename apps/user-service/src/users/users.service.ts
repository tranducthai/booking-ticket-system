import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateMeDto } from "./dto/update-me.dto";

// Never select passwordHash into anything that leaves this service.
const PUBLIC_SELECT = {
  id: true,
  email: true,
  phone: true,
  fullName: true,
  role: true,
  isOrganizerVerified: true,
  isLocked: true,
  emailVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: PUBLIC_SELECT });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return user;
  }

  async updateMe(id: string, dto: UpdateMeDto) {
    return this.prisma.user.update({ where: { id }, data: dto, select: PUBLIC_SELECT });
  }

  /** docs/spec/08-api-contracts.md §1 "GET /users | admin". Not implemented in Phase 1 — added alongside the admin frontend panel (Phase 7b). */
  async listForAdmin(page: number, limit: number, role?: "CUSTOMER" | "ORGANIZER" | "ADMIN") {
    const where = role ? { role } : {};
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

  async setLocked(id: string, isLocked: boolean) {
    return this.prisma.user.update({ where: { id }, data: { isLocked }, select: PUBLIC_SELECT });
  }

  async verifyOrganizer(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { role: "ORGANIZER", isOrganizerVerified: true },
      select: PUBLIC_SELECT,
    });
  }
}
