import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { canManage, Manager } from "../auth/manager";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateDiscountCodeDto } from "./dto/create-discount-code.dto";
import { UpdateDiscountCodeDto } from "./dto/update-discount-code.dto";

@Injectable()
export class DiscountCodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
  ) {}

  async create(eventId: string, actor: Manager, dto: CreateDiscountCodeDto) {
    await this.assertEventOwner(eventId, actor);
    assertDiscountValue(dto.discountType, dto.value);
    return this.prisma.discountCode.create({ data: { ...dto, eventId } });
  }

  /** Organizer's own management view — includes inactive/expired codes and quantityUsed, unlike validate() below which only ever sees usable ones. */
  async listForEvent(eventId: string, actor: Manager) {
    await this.assertEventOwner(eventId, actor);
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
  async update(id: string, actor: Manager, dto: UpdateDiscountCodeDto) {
    const discount = await this.assertDiscountOwner(id, actor);
    if (dto.quantityTotal !== undefined && dto.quantityTotal < discount.quantityUsed) {
      throw new BadRequestException(`Không thể giảm số lượt dưới ${discount.quantityUsed} lượt đã dùng`);
    }
    assertDiscountValue(dto.discountType ?? discount.discountType, dto.value ?? Number(discount.value));
    return this.prisma.discountCode.update({ where: { id }, data: dto });
  }

  /** Hard delete only when untouched — a code that's already been redeemed has orders referencing it by code text (not a foreign key), so removing it would make those orders' history unexplainable. Deactivate instead in that case. */
  async remove(id: string, actor: Manager): Promise<void> {
    const discount = await this.assertDiscountOwner(id, actor);
    if (discount.quantityUsed > 0) {
      throw new BadRequestException("This code has already been redeemed at least once — deactivate it instead of deleting");
    }
    await this.prisma.discountCode.delete({ where: { id } });
    // Explicit, not @LogActivity: the route returns nothing to read eventId/code from.
    await this.activity.record({
      action: "discount_code.deleted",
      targetType: "discount_code",
      targetId: id,
      eventId: discount.eventId,
      summary: `Xóa mã giảm giá ${discount.code}`,
    });
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
      UPDATE ${this.prisma.table("DiscountCode")}
      SET "quantityUsed" = "quantityUsed" + 1
      WHERE "eventId" = ${eventId} AND "code" = ${code} AND "quantityUsed" < "quantityTotal"
    `;
    if (affected === 0) {
      throw new ConflictException(`Discount code ${code} could not be redeemed (not found or exhausted)`);
    }
  }

  async release(eventId: string, code: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE ${this.prisma.table("DiscountCode")}
      SET "quantityUsed" = GREATEST("quantityUsed" - 1, 0)
      WHERE "eventId" = ${eventId} AND "code" = ${code}
    `;
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

  private async assertDiscountOwner(id: string, actor: Manager) {
    const discount = await this.prisma.discountCode.findUnique({ where: { id } });
    if (!discount) {
      throw new NotFoundException("Discount code not found");
    }
    await this.assertEventOwner(discount.eventId, actor);
    return discount;
  }
}

function assertDiscountValue(type: string, value: number) {
  if (type === "PERCENT" && (value < 1 || value > 100)) {
    throw new BadRequestException("Giảm theo phần trăm phải từ 1% đến 100%");
  }
}
