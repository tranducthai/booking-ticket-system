import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { EXCHANGES, RefundApprovedPayload, ROUTING_KEYS } from "@booking-ticket-system/event-contracts";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { Refund, RefundKind, RefundStatus } from "../generated/prisma";
import { PaymentGatewayResolver } from "../gateway/payment-gateway.resolver";
import { MetricsService } from "../metrics/metrics.service";
import { PrismaService } from "../prisma/prisma.service";
import { RabbitMqService } from "../rabbitmq/rabbitmq.service";
import { refundActivity } from "./refund-activity";

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 20; // per tick — a canceled 5,000-ticket event drains over minutes instead of hammering the gateway
const RETRY_BACKOFF_MS = 5 * 60 * 1000; // × attempts

const METRIC_KIND: Record<RefundKind, string> = {
  CUSTOMER_REQUEST: "manual",
  EVENT_CANCELED: "event_canceled",
  EVENT_POSTPONED: "postponed",
  SYSTEM_ERROR: "auto",
};

/**
 * Executes APPROVED refunds against the gateway — docs/spec/13-refund-and-anti-fraud-design.md §2.5.
 *
 * Double-payout safety, which the old approve() lacked (it called the
 * gateway first and only then flipped REQUESTED -> COMPLETED, so a failed
 * DB write left the refund approvable — and payable — again):
 *  - APPROVED|FAILED -> PROCESSING is one conditional UPDATE; whoever wins
 *    it (a reviewer's click, this cron, a second replica) is the only one
 *    that calls the gateway.
 *  - The gateway gets Refund.id as its idempotency key.
 *  - A definite "no" from the gateway -> FAILED, retried with backoff. A
 *    THROWN error (timeout: did it pay or not?) leaves the row PROCESSING
 *    for a human to reconcile — never retried blindly.
 */
@Injectable()
export class RefundProcessorService {
  private readonly logger = new Logger(RefundProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
    private readonly gatewayResolver: PaymentGatewayResolver,
    private readonly rabbit: RabbitMqService,
    private readonly metrics: MetricsService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async drain(): Promise<void> {
    const now = Date.now();
    const candidates = await this.prisma.refund.findMany({
      where: {
        OR: [{ status: RefundStatus.APPROVED }, { status: RefundStatus.FAILED, attempts: { lt: MAX_ATTEMPTS } }],
      },
      orderBy: { updatedAt: "asc" },
      take: BATCH_SIZE * 2,
    });
    const due = candidates
      .filter((r) => r.status === RefundStatus.APPROVED || r.updatedAt.getTime() + r.attempts * RETRY_BACKOFF_MS <= now)
      .slice(0, BATCH_SIZE);
    for (const refund of due) {
      await this.process(refund.id).catch((err) => this.logger.error(`Refund ${refund.id}: ${(err as Error).message}`));
    }
  }

  /** Returns the refund as it stands afterwards; a no-op if someone else is already processing it. */
  async process(refundId: string): Promise<Refund> {
    const claimed = await this.prisma.refund.updateMany({
      where: { id: refundId, status: { in: [RefundStatus.APPROVED, RefundStatus.FAILED] }, attempts: { lt: MAX_ATTEMPTS } },
      data: { status: RefundStatus.PROCESSING, attempts: { increment: 1 } },
    });
    if (claimed.count === 0) {
      return this.prisma.refund.findUniqueOrThrow({ where: { id: refundId } });
    }

    const refund = await this.prisma.refund.findUniqueOrThrow({ where: { id: refundId }, include: { payment: true } });
    const gross = Number(refund.grossAmount ?? refund.payment.amount);
    let outcome;
    try {
      outcome = await this.gatewayResolver.forMethod(refund.payment.method).refund({
        paymentId: refund.paymentId,
        gatewayTxnId: refund.payment.gatewayTxnId,
        amount: Number(refund.amount),
        orderInfo: `Refund for order ${refund.orderId}`,
        idempotencyKey: refund.id,
        partial: Number(refund.amount) < gross,
      });
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Refund ${refund.id}: gateway outcome UNKNOWN (${message}) — left PROCESSING for manual reconciliation`);
      await this.prisma.refund.update({ where: { id: refund.id }, data: { lastError: `unknown outcome: ${message}` } });
      return this.prisma.refund.findUniqueOrThrow({ where: { id: refund.id } });
    }

    if (!outcome.success) {
      const updated = await this.prisma.refund.update({
        where: { id: refund.id },
        data: { status: RefundStatus.FAILED, lastError: outcome.message },
      });
      await this.audit(refund.id, RefundStatus.PROCESSING, RefundStatus.FAILED, "FAIL", outcome.message);
      this.logger.warn(`Refund ${refund.id}: gateway refused (${outcome.message}), attempt ${updated.attempts}/${MAX_ATTEMPTS}`);
      return updated;
    }

    const completed = await this.prisma.refund.update({
      where: { id: refund.id },
      data: { status: RefundStatus.COMPLETED, gatewayRefundId: outcome.gatewayRefundId, completedAt: new Date(), lastError: null },
    });
    await this.audit(refund.id, RefundStatus.PROCESSING, RefundStatus.COMPLETED, "COMPLETE", outcome.gatewayRefundId ?? null);

    const payload: RefundApprovedPayload = {
      refundId: completed.id,
      orderId: completed.orderId,
      amount: Number(completed.amount),
      approvedAt: (completed.decidedAt ?? completed.completedAt!).toISOString(),
      userId: completed.userId ?? undefined,
      kind: completed.kind,
    };
    await this.rabbit.publish(EXCHANGES.PAYMENT, ROUTING_KEYS.REFUND_APPROVED, payload);
    this.metrics.refundsCompletedTotal.inc({ kind: METRIC_KIND[completed.kind] });
    return completed;
  }

  private async audit(refundId: string, fromStatus: string, toStatus: string, action: string, note: string | null) {
    await this.prisma.refundAuditLog.create({ data: { refundId, actorId: "system", action, fromStatus, toStatus, note } });
    const refund = await this.prisma.refund.findUnique({ where: { id: refundId } });
    if (refund) {
      await this.activity.record(refundActivity(refund, "system", action, note));
    }
  }
}
