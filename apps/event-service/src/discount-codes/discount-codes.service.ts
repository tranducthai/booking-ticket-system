import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateDiscountCodeDto } from "./dto/create-discount-code.dto";

@Injectable()
export class DiscountCodesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(eventId: string, organizerId: string, dto: CreateDiscountCodeDto) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException("Event not found");
    }
    if (event.organizerId !== organizerId) {
      throw new ForbiddenException("You do not own this event");
    }
    return this.prisma.discountCode.create({ data: { ...dto, eventId } });
  }

  async validate(eventId: string, code: string) {
    const discount = await this.prisma.discountCode.findUnique({
      where: { eventId_code: { eventId, code } },
    });
    if (!discount) {
      throw new BadRequestException("This discount code is not valid for this event");
    }

    const now = new Date();
    if (discount.validFrom && now < discount.validFrom) {
      throw new BadRequestException("This discount code is not active yet");
    }
    if (discount.validTo && now > discount.validTo) {
      throw new BadRequestException("This discount code has expired");
    }
    if (discount.quantityUsed >= discount.quantityTotal) {
      throw new BadRequestException("This discount code has been fully redeemed");
    }

    return discount;
  }
}
