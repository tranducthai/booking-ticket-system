import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateDiscountCodeDto } from "./dto/create-discount-code.dto";
import { UpdateDiscountCodeDto } from "./dto/update-discount-code.dto";

@Injectable()
export class DiscountCodesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(eventId: string, organizerId: string, dto: CreateDiscountCodeDto) {
    await this.assertEventOwner(eventId, organizerId);
    return this.prisma.discountCode.create({ data: { ...dto, eventId } });
  }

  /** Organizer's own management view — includes inactive/expired codes and quantityUsed, unlike validate() below which only ever sees usable ones. */
  async listForEvent(eventId: string, organizerId: string, isAdmin: boolean) {
    if (!isAdmin) {
      await this.assertEventOwner(eventId, organizerId);
    }
    return this.prisma.discountCode.findMany({ where: { eventId }, orderBy: { createdAt: "desc" } });
  }

  async validate(eventId: string, code: string) {
    const discount = await this.prisma.discountCode.findUnique({
      where: { eventId_code: { eventId, code } },
    });
    if (!discount) {
      throw new BadRequestException("This discount code is not valid for this event");
    }
    if (!discount.isActive) {
      throw new BadRequestException("This discount code has been deactivated");
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

  /** No `code` text changes — see UpdateDiscountCodeDto's doc comment. Covers editing terms (value/quantity/validity window) and the isActive on/off switch. */
  async update(id: string, organizerId: string, dto: UpdateDiscountCodeDto) {
    const discount = await this.assertDiscountOwner(id, organizerId);
    if (dto.quantityTotal !== undefined && dto.quantityTotal < discount.quantityUsed) {
      throw new BadRequestException(`Cannot set quantityTotal below the ${discount.quantityUsed} already redeemed`);
    }
    return this.prisma.discountCode.update({ where: { id }, data: dto });
  }

  /** Hard delete only when untouched — a code that's already been redeemed has orders referencing it by code text (not a foreign key), so removing it would make those orders' history unexplainable. Deactivate instead in that case. */
  async remove(id: string, organizerId: string): Promise<void> {
    const discount = await this.assertDiscountOwner(id, organizerId);
    if (discount.quantityUsed > 0) {
      throw new BadRequestException("This code has already been redeemed at least once — deactivate it instead of deleting");
    }
    await this.prisma.discountCode.delete({ where: { id } });
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

  private async assertEventOwner(eventId: string, organizerId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException("Event not found");
    }
    if (event.organizerId !== organizerId) {
      throw new ForbiddenException("You do not own this event");
    }
    return event;
  }

  private async assertDiscountOwner(id: string, organizerId: string) {
    const discount = await this.prisma.discountCode.findUnique({ where: { id } });
    if (!discount) {
      throw new NotFoundException("Discount code not found");
    }
    await this.assertEventOwner(discount.eventId, organizerId);
    return discount;
  }
}
