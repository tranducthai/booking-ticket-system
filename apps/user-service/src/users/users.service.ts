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
}
