import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { OrderStatus } from "../generated/prisma";
import { EventServiceClient } from "../event-client/event-service.client";
import { PrismaService } from "../prisma/prisma.service";
import { ApplyDiscountDto } from "./dto/apply-discount.dto";
import { ListOrdersDto } from "./dto/list-orders.dto";

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventClient: EventServiceClient,
  ) {}

  async findOwned(orderId: string, userId: string) {
    const order = await this.getOwnedOrder(orderId, userId);
    return order;
  }

  /** Customer's own orders, paginated (docs/spec/08-api-contracts.md §3). */
  async listMine(userId: string, query: ListOrdersDto) {
    return this.paginate({ userId }, query);
  }

  /** Organizer/admin dashboard view — filterable by event/status, not scoped to one user. */
  async listForDashboard(query: ListOrdersDto) {
    const where: { eventId?: string; status?: OrderStatus } = {};
    if (query.eventId) where.eventId = query.eventId;
    if (query.status) where.status = query.status;
    return this.paginate(where, query);
  }

  async applyDiscount(orderId: string, userId: string, dto: ApplyDiscountDto) {
    const order = await this.getOwnedOrder(orderId, userId);
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException("Discount codes can only be applied before payment");
    }

    const result = await this.eventClient.validateDiscountCode(order.eventId, dto.code);
    if (!result.valid) {
      throw new BadRequestException(result.reason);
    }

    const subtotal = Number(order.subtotal);
    const rawDiscount = result.discountType === "PERCENT" ? subtotal * (result.value / 100) : result.value;
    const discountAmount = Math.min(rawDiscount, subtotal);
    const totalAmount = subtotal - discountAmount;

    return this.prisma.order.update({
      where: { id: orderId },
      data: { discountCode: dto.code, discountAmount, totalAmount },
      include: { items: true },
    });
  }

  /**
   * Customer-initiated cancel before payment. Releases synchronously (rather
   * than via the OrderCanceled broker event, which is reserved for the
   * post-payment/refund path — see sagas/refund-events.consumer.ts) because
   * nothing downstream has any state yet: no Ticket exists, and the seat map
   * should flip back to Available immediately for anyone watching it.
   */
  async cancel(orderId: string, userId: string) {
    const order = await this.getOwnedOrder(orderId, userId);
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException("Only a pending order can be canceled this way");
    }

    for (const item of order.items) {
      if (item.seatId) {
        await this.eventClient.releaseSeat(item.seatId);
      } else if (item.ticketTypeId) {
        await this.eventClient.releaseTicketType(item.ticketTypeId, item.quantity);
      }
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELED },
      include: { items: true },
    });
  }

  private async getOwnedOrder(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) {
      throw new NotFoundException("Order not found");
    }
    if (order.userId !== userId) {
      throw new ForbiddenException("You do not own this order");
    }
    return order;
  }

  private async paginate(where: { userId?: string; eventId?: string; status?: OrderStatus }, query: ListOrdersDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { data, page, limit, total };
  }
}
