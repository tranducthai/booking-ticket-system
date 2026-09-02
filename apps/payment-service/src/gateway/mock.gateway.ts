import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  BuildPaymentUrlInput,
  CallbackOutcome,
  PaymentGateway,
  QueryStatusInput,
  QueryStatusOutcome,
  RefundInput,
  RefundOutcome,
} from "./payment-gateway.interface";

/**
 * Deterministic local stand-in for a real gateway — this is what
 * PAYMENT_GATEWAY_MODE defaults to (gateway.module.ts) precisely because
 * there is no real VNPay sandbox merchant account available in this
 * environment. buildPaymentUrl points at this same service's own
 * /payments/:id/mock page (payments.controller.ts) instead of a real
 * redirect, so the whole Saga (hold -> pay -> PaymentSucceeded -> OrderPaid
 * -> TicketIssued -> email) is genuinely exercisable end to end locally.
 * Swap PAYMENT_GATEWAY_MODE=vnpay + real credentials to use
 * VnpaySandboxGateway instead — no other code changes needed.
 */
@Injectable()
export class MockGateway implements PaymentGateway {
  constructor(private readonly config: ConfigService) {}

  private get selfBaseUrl(): string {
    return this.config.get<string>("SELF_BASE_URL") ?? `http://localhost:${this.config.get<string>("PORT") ?? 3004}`;
  }

  async buildPaymentUrl(input: BuildPaymentUrlInput): Promise<string> {
    return `${this.selfBaseUrl}/payments/${input.paymentId}/mock`;
  }

  verifyCallback(params: Record<string, string>): CallbackOutcome {
    const outcome = params.outcome === "fail" ? "fail" : "success";
    return {
      valid: true, // same-service call, nothing to authenticate
      txnRef: params.txnRef,
      success: outcome === "success",
      gatewayTxnId: `MOCK-${Date.now()}`,
      responseCode: outcome === "success" ? "00" : "99",
      message: outcome === "success" ? "Mock payment succeeded" : "Mock payment failed (simulated)",
      raw: params,
    };
  }

  async refund(_input: RefundInput): Promise<RefundOutcome> {
    return { success: true, gatewayRefundId: `MOCKRF-${Date.now()}`, message: "Mock refund always succeeds" };
  }

  /**
   * The mock gateway resolves every payment synchronously (mock-complete),
   * so there's never anything genuinely "stuck" for the reconciliation
   * poller to find — a Payment still PENDING after a while here just means
   * the shopper abandoned the mock checkout page, which isn't the
   * gateway's problem to resolve. Always PENDING is the honest answer.
   */
  async queryStatus(_input: QueryStatusInput): Promise<QueryStatusOutcome> {
    return { status: "PENDING" };
  }
}
