import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PaymentStatus, RefundStatus } from "../generated/prisma";
import { EXCHANGES, RefundApprovedPayload, ROUTING_KEYS } from "@booking-ticket-system/event-contracts";
import { Actor } from "../auth/current-actor.decorator";
import { BookingServiceClient } from "../booking-client/booking-service.client";
import { PaymentGatewayResolver } from "../gateway/payment-gateway.resolver";
import { MetricsService } from "../metrics/metrics.service";
import { PrismaService } from "../prisma/prisma.service";
import { RabbitMqService } from "../rabbitmq/rabbitmq.service";
import { ListRefundsDto } from "./dto/list-refunds.dto";
import { RequestRefundDto } from "./dto/request-refund.dto";

/** docs/spec/08-api-contracts.md §4, UC-04 in docs/spec/02-use-cases.md. */
@Injectable()
export class RefundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly booking: BookingServiceClient,
    private readonly rabbit: RabbitMqService,
    private readonly gatewayResolver: PaymentGatewayResolver,
    private readonly metrics: MetricsService,
  ) {}

  async request(actor: Actor, dto: RequestRefundDto) {
    const order = await this.booking.getOrder(dto.orderId, actor.userId!, actor.role!);

    const payment = await this.prisma.payment.findFirst({
      where: { orderId: order.id, status: PaymentStatus.SUCCEEDED },
      orderBy: { createdAt: "desc" },
    });
    if (!payment) {
      throw new BadRequestException("No successful payment found for this order");
    }

    const existing = await this.prisma.refund.findFirst({
      where: { orderId: order.id, status: { in: [RefundStatus.REQUESTED, RefundStatus.APPROVED] } },
    });
    if (existing) {
      throw new ConflictException("A refund request is already pending for this order");
    }

    return this.prisma.refund.create({
      data: {
        paymentId: payment.id,
        orderId: order.id,
        reason: dto.reason,
        amount: payment.amount,
        requestedBy: actor.userId!,
      },
    });
  }

  async list(actor: Actor, query: ListRefundsDto) {
    const where: { orderId?: { in: string[] }; status?: RefundStatus } = {};
    if (query.eventId) {
      const orderIds = await this.booking.listOrderIdsForEvent(query.eventId, actor.userId!, actor.role!);
      where.orderId = { in: orderIds };
    }
    if (query.status) where.status = query.status;

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [data, total] = await Promise.all([
      this.prisma.refund.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      this.prisma.refund.count({ where }),
    ]);
    return { data, page, limit, total };
  }

  async approve(refundId: string, actor: Actor) {
    const refund = await this.getRequested(refundId);
    const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: refund.paymentId } });

    const gateway = this.gatewayResolver.forMethod(payment.method);
    const outcome = await gateway.refund({
      paymentId: payment.id,
      gatewayTxnId: payment.gatewayTxnId,
      amount: Number(refund.amount),
      orderInfo: `Refund for order ${refund.orderId}`,
    });
    if (!outcome.success) {
      throw new BadRequestException(`Gateway refund failed: ${outcome.message}`);
    }

    const updated = await this.prisma.refund.update({
      where: { id: refund.id },
      data: { status: RefundStatus.COMPLETED, decidedBy: actor.userId!, decidedAt: new Date() },
    });

    const payload: RefundApprovedPayload = {
      refundId: updated.id,
      orderId: updated.orderId,
      amount: Number(updated.amount),
      approvedAt: updated.decidedAt!.toISOString(),
    };
    await this.rabbit.publish(EXCHANGES.PAYMENT, ROUTING_KEYS.REFUND_APPROVED, payload);
    this.metrics.refundsCompletedTotal.inc({ kind: "manual" });

    return updated;
  }

  async reject(refundId: string, actor: Actor) {
    const refund = await this.getRequested(refundId);
    return this.prisma.refund.update({
      where: { id: refund.id },
      data: { status: RefundStatus.REJECTED, decidedBy: actor.userId!, decidedAt: new Date() },
    });
  }

  private async getRequested(refundId: string) {
    const refund = await this.prisma.refund.findUnique({ where: { id: refundId } });
    if (!refund) {
      throw new NotFoundException("Refund not found");
    }
    if (refund.status !== RefundStatus.REQUESTED) {
      throw new BadRequestException(`Refund is already ${refund.status}`);
    }
    return refund;
  }
}
