import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma, PaymentStatus } from "../generated/prisma";
import { EXCHANGES, PaymentFailedPayload, PaymentSucceededPayload, ROUTING_KEYS } from "@booking-ticket-system/event-contracts";
import { Actor } from "../auth/current-actor.decorator";
import { BookingServiceClient } from "../booking-client/booking-service.client";
import { MockGateway } from "../gateway/mock.gateway";
import { PAYMENT_GATEWAY, PaymentGateway } from "../gateway/payment-gateway.interface";
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
  ) {}

  async create(actor: Actor, dto: CreatePaymentDto) {
    const order = await this.booking.getOrder(dto.orderId, actor.userId!, actor.role!);
    if (order.status !== "PENDING_PAYMENT") {
      throw new BadRequestException(`Order is ${order.status}, not payable`);
    }

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
    if (payment.status !== PaymentStatus.PENDING) {
      this.logger.log(`Webhook for payment ${payment.id} already ${payment.status} — idempotent no-op`);
      return { received: true };
    }

    if (outcome.success) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.SUCCEEDED,
          gatewayTxnId: outcome.gatewayTxnId,
          gatewayRawResponse: outcome.raw as Prisma.InputJsonObject,
        },
      });
      const payload: PaymentSucceededPayload = {
        paymentId: payment.id,
        orderId: payment.orderId,
        amount: Number(payment.amount),
        method: payment.method,
        paidAt: new Date().toISOString(),
      };
      await this.rabbit.publish(EXCHANGES.PAYMENT, ROUTING_KEYS.PAYMENT_SUCCEEDED, payload);
    } else {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED, gatewayRawResponse: outcome.raw as Prisma.InputJsonObject },
      });
      const payload: PaymentFailedPayload = {
        paymentId: payment.id,
        orderId: payment.orderId,
        reason: outcome.message,
        failedAt: new Date().toISOString(),
      };
      await this.rabbit.publish(EXCHANGES.PAYMENT, ROUTING_KEYS.PAYMENT_FAILED, payload);
    }

    return { received: true };
  }

  /** Dev/demo convenience — see MockGateway's doc comment. Returns the payment so the controller can redirect back into apps/web with its orderId. */
  async completeMock(paymentId: string, outcome: "success" | "fail") {
    await this.handleWebhook("mock", { txnRef: paymentId, outcome });
    return this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  }
}
