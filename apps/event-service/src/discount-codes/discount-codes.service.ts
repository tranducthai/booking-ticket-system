import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
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

  /**
   * docs/spec/12-resilience-and-failure-design.md "add an atomic redeem at
   * order-confirm + guarded release on cancel". validate() above is
   * read-only on purpose (called while the customer is still shopping) —
   * this is the actual commit, called once by Booking Service's
   * PaymentSucceeded handler, and it's what quantityUsed actually means:
   * before this existed nothing ever incremented it, so quantityTotal was
   * unenforced.
   */
  async redeem(eventId: string, code: string): Promise<void> {
    const affected = await this.prisma.$executeRaw`
      UPDATE "DiscountCode"
      SET "quantityUsed" = "quantityUsed" + 1
      WHERE "eventId" = ${eventId} AND "code" = ${code} AND "quantityUsed" < "quantityTotal"
    `;
    if (affected === 0) {
      throw new ConflictException(`Discount code ${code} could not be redeemed (not found or exhausted)`);
    }
  }

  async release(eventId: string, code: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "DiscountCode"
      SET "quantityUsed" = GREATEST("quantityUsed" - 1, 0)
      WHERE "eventId" = ${eventId} AND "code" = ${code}
    `;
  }
}
