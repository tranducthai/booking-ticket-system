import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Only used for the compensating auto-refund when a seat's hold was lost
 * between PaymentSucceeded and confirmSeat (docs/spec/12-resilience-and-failure-design.md)
 * — see sagas/payment-events.consumer.ts. Real money already moved at this
 * point, so this has to actually reach Payment Service; failures here are
 * logged loudly rather than swallowed.
 */
@Injectable()
export class PaymentServiceClient {
  private readonly logger = new Logger(PaymentServiceClient.name);
  private readonly baseUrl: string;
  private readonly internalToken?: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>("PAYMENT_SERVICE_URL") ?? "http://localhost:3004";
    this.internalToken = config.get<string>("INTERNAL_TOKEN") || undefined;
  }

  async autoRefund(orderId: string, reason: string): Promise<void> {
    try {
      const res = await fetch(`${this.baseUrl}/internal/payments/${orderId}/auto-refund`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.internalToken ? { "x-internal-token": this.internalToken } : {}),
        },
        body: JSON.stringify({ reason }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${body}`);
      }
    } catch (err) {
      // No retry loop here — this is already a compensating action for a
      // rare failure mode; logging loudly is the honest thing to do rather
      // than pretending a best-effort retry would reliably fix a real
      // money-movement failure. A human needs to see this in practice.
      this.logger.error(`AUTO-REFUND FAILED for order ${orderId}: ${(err as Error).message} — needs manual follow-up`);
      throw err;
    }
  }
}
