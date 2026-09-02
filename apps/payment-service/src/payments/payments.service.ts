import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma, PaymentStatus, RefundStatus } from "../generated/prisma";
import {
  EXCHANGES,
  PaymentFailedPayload,
  PaymentSucceededPayload,
  RefundApprovedPayload,
  ROUTING_KEYS,
} from "@booking-ticket-system/event-contracts";
import { Actor } from "../auth/current-actor.decorator";
import { BookingServiceClient } from "../booking-client/booking-service.client";
import { MockGateway } from "../gateway/mock.gateway";
import { PAYMENT_GATEWAY, PaymentGateway } from "../gateway/payment-gateway.interface";
import { MetricsService } from "../metrics/metrics.service";
import { PrismaService } from "../prisma/prisma.service";
import { RabbitMqService } from "../rabbitmq/rabbitmq.service";
import { CreatePaymentDto } from "./dto/create-payment.dto";

/**
 * docs/spec/08-api-contracts.md §4. create() builds the redirect URL;
 * handleWebhook() is the async confirmation that actually drives the Saga —
 * see docs/spec/03-system-design.md step 3 (PaymentSucceeded -> Booking).
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly booking: BookingServiceClient,
    private readonly rabbit: RabbitMqService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly mockGateway: MockGateway,
    private readonly metrics: MetricsService,
  ) {}

  async create(actor: Actor, dto: CreatePaymentDto) {
    const order = await this.booking.getOrder(dto.orderId, actor.userId!, actor.role!);
    if (order.status !== "PENDING_PAYMENT") {
      throw new BadRequestException(`Order is ${order.status}, not payable`);
    }

    // Fire-and-forget-ish (startPayment itself never throws — see its own
    // doc comment): extends the seat hold in event-service now, before the
    // customer even reaches the gateway's checkout page.
    await this.booking.startPayment(order.id, actor.userId!);

    const payment = await this.prisma.payment.create({
      data: { orderId: order.id, amount: order.totalAmount, method: dto.method, status: PaymentStatus.PENDING },
    });

    const redirectUrl = await this.gateway.buildPaymentUrl({
      paymentId: payment.id,
      amount: order.totalAmount,
      orderInfo: `Payment for order ${order.id}`,
      ipAddr: "127.0.0.1",
    });

    return { paymentId: payment.id, redirectUrl };
  }

  async findOwned(paymentId: string, actor: Actor) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      throw new NotFoundException("Payment not found");
    }
    // Transitively enforces ownership — throws ForbiddenException if the
    // caller doesn't own the underlying order (see BookingServiceClient).
    await this.booking.getOrder(payment.orderId, actor.userId!, actor.role!);
    return payment;
  }

  async handleWebhook(provider: string, params: Record<string, string>) {
    const gateway = provider === "mock" ? this.mockGateway : this.gateway;
    const outcome = gateway.verifyCallback(params);
    if (!outcome.valid) {
      throw new BadRequestException("Invalid gateway signature");
    }

    const payment = await this.prisma.payment.findUnique({ where: { id: outcome.txnRef } });
    if (!payment) {
      throw new NotFoundException(`Unknown payment ${outcome.txnRef}`);
    }
    await this.applyOutcome(payment.id, outcome.success, outcome.gatewayTxnId, outcome.message, outcome.raw);
    return { received: true };
  }

  /**
   * Shared by handleWebhook (after signature verification) and
   * reconcilePending (whose "signature" IS the fact that queryStatus was a
   * direct authenticated server-to-server call to the gateway — there's no
   * user-supplied callback to verify there). Idempotent: a payment already
   * out of PENDING is left untouched either way.
   */
  private async applyOutcome(
    paymentId: string,
    success: boolean,
    gatewayTxnId: string | undefined,
    reason: string,
    raw: Record<string, unknown>,
  ) {
    const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    if (payment.status !== PaymentStatus.PENDING) {
      this.logger.log(`applyOutcome(${paymentId}): already ${payment.status} — idempotent no-op`);
      return;
    }

    if (success) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.SUCCEEDED, gatewayTxnId, gatewayRawResponse: raw as Prisma.InputJsonObject },
      });
      const payload: PaymentSucceededPayload = {
        paymentId: payment.id,
        orderId: payment.orderId,
        amount: Number(payment.amount),
        method: payment.method,
        paidAt: new Date().toISOString(),
      };
      await this.rabbit.publish(EXCHANGES.PAYMENT, ROUTING_KEYS.PAYMENT_SUCCEEDED, payload);
      this.metrics.paymentsSucceededTotal.inc({ gateway: payment.method });
    } else {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED, gatewayRawResponse: raw as Prisma.InputJsonObject },
      });
      const payload: PaymentFailedPayload = {
        paymentId: payment.id,
        orderId: payment.orderId,
        reason,
        failedAt: new Date().toISOString(),
      };
      await this.rabbit.publish(EXCHANGES.PAYMENT, ROUTING_KEYS.PAYMENT_FAILED, payload);
      this.metrics.paymentsFailedTotal.inc({ gateway: payment.method });
    }
  }

  /** Dev/demo convenience — see MockGateway's doc comment. Returns the payment so the controller can redirect back into apps/web with its orderId. */
  async completeMock(paymentId: string, outcome: "success" | "fail") {
    await this.handleWebhook("mock", { txnRef: paymentId, outcome });
    return this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  }

  /**
   * System-triggered compensating refund — called by Booking Service's
   * PaymentSucceeded consumer when a seat hold was lost before confirm
   * could land (docs/spec/12-resilience-and-failure-design.md). Distinct
   * from the customer-initiated request/approve flow in refunds.service.ts:
   * there's no REQUESTED step to wait on here, the money has to come back
   * immediately since the order is being force-canceled right now.
   */
  async autoRefund(orderId: string, reason: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { orderId, status: PaymentStatus.SUCCEEDED },
      orderBy: { createdAt: "desc" },
    });
    if (!payment) {
      this.logger.error(`autoRefund(${orderId}): no SUCCEEDED payment found — nothing to refund`);
      throw new NotFoundException("No successful payment found for this order");
    }

    const outcome = await this.gateway.refund({
      paymentId: payment.id,
      gatewayTxnId: payment.gatewayTxnId,
      amount: Number(payment.amount),
      orderInfo: reason,
    });
    if (!outcome.success) {
      this.logger.error(`autoRefund(${orderId}) FAILED at the gateway: ${outcome.message} — needs manual follow-up`);
      throw new BadRequestException(`Gateway refund failed: ${outcome.message}`);
    }

    const refund = await this.prisma.refund.create({
      data: {
        paymentId: payment.id,
        orderId,
        reason,
        amount: payment.amount,
        status: RefundStatus.COMPLETED,
        requestedBy: "system",
        decidedBy: "system",
        decidedAt: new Date(),
      },
    });

    const payload: RefundApprovedPayload = {
      refundId: refund.id,
      orderId,
      amount: Number(refund.amount),
      approvedAt: refund.decidedAt!.toISOString(),
    };
    await this.rabbit.publish(EXCHANGES.PAYMENT, ROUTING_KEYS.REFUND_APPROVED, payload);
    this.metrics.refundsCompletedTotal.inc({ kind: "auto" });
    this.logger.warn(`Auto-refunded order ${orderId}: ${reason}`);
    return refund;
  }

  /**
   * docs/spec/12-resilience-and-failure-design.md "payment reconciliation
   * poller (poll the gateway for PENDING payments older than ~2 min)" —
   * catches the case where the customer's browser never made it back to
   * the webhook/return URL (closed the tab, network dropped) but the
   * gateway itself did actually process the payment. Called from a cron
   * (see reconciliation.service.ts) rather than living here directly so
   * this class stays request-driven and the cron's own schedule is
   * independently testable/configurable.
   */
  async reconcilePending(olderThanMs: number): Promise<{ checked: number; resolved: number }> {
    const stale = await this.prisma.payment.findMany({
      where: { status: PaymentStatus.PENDING, createdAt: { lt: new Date(Date.now() - olderThanMs) } },
      take: 50,
    });
    let resolved = 0;
    for (const payment of stale) {
      const outcome = await this.gateway.queryStatus({
        paymentId: payment.id,
        gatewayTxnId: payment.gatewayTxnId,
        orderInfo: `Payment for order ${payment.orderId}`,
        transactionDate: payment.createdAt,
      });
      if (outcome.status === "PENDING") continue;

      this.metrics.reconciliationMismatchesTotal.inc();
      if (outcome.status === "SUCCEEDED") {
        await this.applyOutcome(payment.id, true, outcome.gatewayTxnId, "Confirmed via reconciliation poll", {
          source: "reconciliation",
        });
      } else {
        await this.applyOutcome(payment.id, false, undefined, outcome.message, { source: "reconciliation" });
      }
      resolved++;
    }
    return { checked: stale.length, resolved };
  }
}
