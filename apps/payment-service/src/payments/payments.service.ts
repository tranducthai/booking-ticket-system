import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { vnd } from "../activity-log/format";
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
import { PaymentGatewayResolver } from "../gateway/payment-gateway.resolver";
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
    private readonly activity: ActivityLogService,
    private readonly booking: BookingServiceClient,
    private readonly rabbit: RabbitMqService,
    private readonly gatewayResolver: PaymentGatewayResolver,
    private readonly metrics: MetricsService,
  ) {}

  async create(actor: Actor, dto: CreatePaymentDto) {
    const order = await this.booking.getOrder(dto.orderId, actor.userId!, actor.role!);
    if (order.status !== "PENDING_PAYMENT") {
      throw new BadRequestException(`Order is ${order.status}, not payable`);
    }
    // A 0đ order (free registration, 100% discount) is confirmed by booking-service
    // directly (POST /orders/:id/confirm-free) — never sent to a gateway.
    if (Number(order.totalAmount) <= 0) {
      throw new BadRequestException("Đơn miễn phí không cần thanh toán — hãy xác nhận đăng ký");
    }

    // Fire-and-forget-ish (startPayment itself never throws — see its own
    // doc comment): extends the seat hold in event-service now, before the
    // customer even reaches the gateway's checkout page.
    await this.booking.startPayment(order.id, actor.userId!);

    const payment = await this.prisma.payment.create({
      data: { orderId: order.id, amount: order.totalAmount, method: dto.method, status: PaymentStatus.PENDING },
    });

    const gateway = this.gatewayResolver.forMethod(dto.method);
    const built = await gateway.buildPaymentUrl({
      paymentId: payment.id,
      orderId: order.id,
      amount: order.totalAmount,
      orderInfo: `Payment for order ${order.id}`,
      ipAddr: "127.0.0.1",
    });
    // PayPal's Orders API assigns its own order id upfront (before the
    // customer even approves) — persisted now so reconcilePending has
    // something to queryStatus against later. VNPay/MoMo/mock never set
    // this (see BuiltPaymentUrl's doc comment).
    if (built.gatewayRef) {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { gatewayTxnId: built.gatewayRef } });
    }

    await this.activity.record({
      action: "payment.started",
      targetType: "payment",
      targetId: payment.id,
      eventId: order.eventId,
      subjectUserId: order.userId,
      summary: `Bắt đầu thanh toán ${vnd(order.totalAmount)} qua ${dto.method} (đơn #${order.id.slice(0, 8)})`,
      metadata: { orderId: order.id, method: dto.method, amount: order.totalAmount },
    });

    return { paymentId: payment.id, redirectUrl: built.redirectUrl };
  }

  /** The payment plus, for a still-PENDING bank transfer, the QR/account details the checkout page shows. */
  private withInstructions<T extends { id: string; method: string; status: PaymentStatus; amount: Prisma.Decimal }>(payment: T) {
    const gateway = this.gatewayResolver.forMethod(payment.method);
    const bankTransfer =
      payment.status === PaymentStatus.PENDING && gateway.bankTransferInstructions
        ? gateway.bankTransferInstructions({ paymentId: payment.id, amount: Number(payment.amount) })
        : null;
    return { ...payment, bankTransfer };
  }

  async findOwned(paymentId: string, actor: Actor) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      throw new NotFoundException("Payment not found");
    }
    // Transitively enforces ownership — throws ForbiddenException if the
    // caller doesn't own the underlying order (see BookingServiceClient).
    await this.booking.getOrder(payment.orderId, actor.userId!, actor.role!);
    return this.withInstructions(payment);
  }

  /** Server-to-server IPN — `:provider` is which gateway is calling. */
  async handleWebhook(provider: string, params: Record<string, string>, headers?: Record<string, string | string[] | undefined>) {
    await this.resolveAndApply(provider, params, headers);
    // `success: true` is what SePay requires before it stops retrying; the other gateways ignore the body.
    return { received: true, success: true };
  }

  /**
   * Browser redirect back from the gateway's own checkout page
   * (PaymentsController's GET return/:provider). Distinct route from the
   * POST webhook above because this leg is user-initiated (query params,
   * no auth) — for PayPal it's actually the ONLY confirmation leg wired up
   * here (see paypal.gateway.ts verifyCallback's doc comment), for
   * VNPay/MoMo it's a second, redundant confirmation of the same IPN.
   * Returns the payment so the controller can redirect into apps/web with
   * its orderId + outcome.
   */
  async handleReturn(provider: string, params: Record<string, string>) {
    const payment = await this.resolveAndApply(provider, params);
    if (!payment) throw new NotFoundException("Callback did not refer to a payment");
    return payment;
  }

  /** Returns null for a valid callback that isn't about any of our payments (see CallbackOutcome.ignoredReason). */
  private async resolveAndApply(
    provider: string,
    params: Record<string, string>,
    headers?: Record<string, string | string[] | undefined>,
  ) {
    const gateway = this.gatewayResolver.forProvider(provider);
    const outcome = await gateway.verifyCallback(params, headers);
    if (!outcome.valid) {
      throw new BadRequestException("Invalid gateway signature");
    }
    if (outcome.ignoredReason) {
      this.logger.log(`${provider} callback ignored: ${outcome.ignoredReason}`);
      return null;
    }

    const payment = outcome.txnRefIsPrefix
      ? await this.prisma.payment.findFirst({ where: { id: { startsWith: outcome.txnRef }, method: provider } })
      : await this.prisma.payment.findUnique({ where: { id: outcome.txnRef } });
    if (!payment) {
      if (outcome.txnRefIsPrefix) {
        // Money already landed in the bank account — throwing would only make SePay retry the same
        // unmatchable transfer. Ack it, and leave a loud trail for a manual refund.
        this.logger.error(`${provider}: received ${outcome.paidAmount ?? "?"}đ with code ${outcome.txnRef} matching no payment — refund manually`);
        await this.activity.record({
          actorId: "system",
          action: "payment.unmatched_funds",
          targetType: "payment",
          summary: `Nhận ${vnd(outcome.paidAmount ?? 0)} qua ${provider} nhưng không khớp thanh toán nào (mã ${outcome.txnRef}) — cần hoàn thủ công`,
          metadata: { provider, gatewayTxnId: outcome.gatewayTxnId ?? null, raw: outcome.raw },
        });
        return null;
      }
      throw new NotFoundException(`Unknown payment ${outcome.txnRef}`);
    }
    await this.applyOutcome(payment.id, outcome.success, outcome.gatewayTxnId, outcome.message, outcome.raw, outcome.paidAmount);
    return this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
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
    paidAmount?: number,
  ) {
    const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    if (payment.status !== PaymentStatus.PENDING) {
      if (success && gatewayTxnId && payment.gatewayTxnId && gatewayTxnId !== payment.gatewayTxnId) {
        // Not a redelivery of the callback already applied — a SECOND real payment (customer
        // transferred twice, or paid after the payment failed). Money arrived; nothing will issue for it.
        await this.recordOrphanFunds(payment, gatewayTxnId, paidAmount, `payment already ${payment.status}`);
        return;
      }
      this.logger.log(`applyOutcome(${paymentId}): already ${payment.status} — idempotent no-op`);
      return;
    }

    if (success && paidAmount !== undefined && paidAmount < Number(payment.amount)) {
      // Underpaid: issue nothing, but leave it PENDING so a correct full transfer can still settle it — the short one needs a manual refund.
      await this.recordOrphanFunds(payment, gatewayTxnId, paidAmount, `underpaid, expected ${Number(payment.amount)}`);
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
      // Admin audit only: Payment carries no userId/eventId — the customer and
      // organizer views get booking-service's "order.paid" row instead.
      await this.activity.record({
        actorId: "system",
        action: "payment.succeeded",
        targetType: "payment",
        targetId: payment.id,
        summary: `Cổng ${payment.method} xác nhận thanh toán ${vnd(payment.amount)} (đơn #${payment.orderId.slice(0, 8)})`,
        metadata: { orderId: payment.orderId, gatewayTxnId: gatewayTxnId ?? null },
      });
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
      await this.activity.record({
        actorId: "system",
        action: "payment.failed",
        targetType: "payment",
        targetId: payment.id,
        summary: `Cổng ${payment.method} báo thanh toán thất bại (đơn #${payment.orderId.slice(0, 8)}): ${reason}`,
        metadata: { orderId: payment.orderId, reason },
      });
    }
  }

  /** Money the gateway confirms we received but that settles no order — needs a human to refund it. */
  private async recordOrphanFunds(
    payment: { id: string; orderId: string; method: string },
    gatewayTxnId: string | undefined,
    paidAmount: number | undefined,
    why: string,
  ) {
    this.logger.error(`Payment ${payment.id}: ${payment.method} txn ${gatewayTxnId} received but not applied (${why}) — refund manually`);
    await this.activity.record({
      actorId: "system",
      action: "payment.unmatched_funds",
      targetType: "payment",
      targetId: payment.id,
      summary: `Nhận ${paidAmount !== undefined ? vnd(paidAmount) : "tiền"} qua ${payment.method} cho đơn #${payment.orderId.slice(0, 8)} nhưng không áp dụng được (${why}) — cần hoàn thủ công`,
      metadata: { orderId: payment.orderId, gatewayTxnId: gatewayTxnId ?? null, paidAmount: paidAmount ?? null, why },
    });
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

    const gateway = this.gatewayResolver.forMethod(payment.method);
    const outcome = await gateway.refund({
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
        kind: "SYSTEM_ERROR",
        grossAmount: payment.amount,
        amount: payment.amount,
        status: RefundStatus.COMPLETED,
        completedAt: new Date(),
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
      kind: "SYSTEM_ERROR",
    };
    await this.rabbit.publish(EXCHANGES.PAYMENT, ROUTING_KEYS.REFUND_APPROVED, payload);
    this.metrics.refundsCompletedTotal.inc({ kind: "auto" });
    await this.activity.record({
      actorId: "system",
      action: "refund.auto_completed",
      targetType: "refund",
      targetId: refund.id,
      summary: `Hoàn tự động ${vnd(refund.amount)} cho đơn #${orderId.slice(0, 8)}: ${reason}`,
      metadata: { orderId },
    });
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
      const gateway = this.gatewayResolver.forMethod(payment.method);
      const outcome = await gateway.queryStatus({
        paymentId: payment.id,
        gatewayTxnId: payment.gatewayTxnId,
        orderInfo: `Payment for order ${payment.orderId}`,
        transactionDate: payment.createdAt,
      });
      if (outcome.status === "PENDING") continue;

      this.metrics.reconciliationMismatchesTotal.inc();
      if (outcome.status === "SUCCEEDED") {
        await this.applyOutcome(
          payment.id,
          true,
          outcome.gatewayTxnId,
          "Confirmed via reconciliation poll",
          { source: "reconciliation" },
          outcome.paidAmount,
        );
      } else {
        await this.applyOutcome(payment.id, false, undefined, outcome.message, { source: "reconciliation" });
      }
      resolved++;
    }
    return { checked: stale.length, resolved };
  }
}
