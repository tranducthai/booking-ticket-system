/** Real, wired-up gateways — dispatch key doubles as the `:provider` path segment and the Payment.method value (docs/spec/08-api-contracts.md §4). */
export const GATEWAY_METHODS = ["vnpay", "momo", "paypal", "sepay"] as const;
export type GatewayMethod = (typeof GATEWAY_METHODS)[number];

export interface BuildPaymentUrlInput {
  paymentId: string;
  orderId: string;
  amount: number; // VND, major unit
  orderInfo: string;
  ipAddr: string;
}

export interface CallbackOutcome {
  valid: boolean; // signature check passed
  txnRef: string; // maps back to Payment.id
  success: boolean;
  gatewayTxnId?: string;
  responseCode: string;
  message: string;
  raw: Record<string, unknown>;
  /**
   * What the gateway says was actually paid (VND). When set, applyOutcome
   * refuses to mark a payment SUCCEEDED for less than Payment.amount — a
   * signed callback proves who sent it, not that the customer paid enough
   * (bank transfers in particular: the customer types the amount).
   */
  paidAmount?: number;
  /**
   * txnRef is only a prefix of Payment.id, not the whole id — SePay's
   * transfer code is a short slice of the id the customer types into their
   * banking app (see sepay.gateway.ts paymentCode()).
   */
  txnRefIsPrefix?: boolean;
  /**
   * Valid callback that isn't about any payment of ours — e.g. SePay fires
   * for EVERY movement on the linked bank account (outgoing transfers,
   * unrelated incoming ones). Acknowledged and dropped, never an error, or
   * the gateway would keep retrying it.
   */
  ignoredReason?: string;
}

export interface RefundInput {
  paymentId: string;
  gatewayTxnId: string | null;
  amount: number;
  orderInfo: string;
  /**
   * Refund.id — stable across retries of the SAME refund, so a gateway that
   * dedupes on a caller-supplied id (MoMo's orderId) turns an accidental
   * second attempt into a rejected duplicate instead of a second payout
   * (docs/spec/13-refund-and-anti-fraud-design.md §2.5).
   */
  idempotencyKey?: string;
  /** Less than the amount originally paid (tiered policy) — VNPay needs a different transaction type for that. */
  partial?: boolean;
}

export interface RefundOutcome {
  success: boolean;
  gatewayRefundId?: string;
  message: string;
}

export interface QueryStatusInput {
  paymentId: string;
  gatewayTxnId: string | null;
  orderInfo: string;
  transactionDate: Date; // the payment's createdAt — VNPay's querydr needs the original txn date
}

export type QueryStatusOutcome =
  | { status: "SUCCEEDED"; gatewayTxnId?: string; paidAmount?: number } // paidAmount: see CallbackOutcome.paidAmount
  | { status: "FAILED"; message: string }
  | { status: "PENDING" }; // still processing, or the gateway doesn't support querying (MockGateway)

export interface BuiltPaymentUrl {
  redirectUrl: string;
  // Set only by gateways that assign their own transaction/order id BEFORE
  // the customer ever completes checkout (currently just PayPal — its
  // Orders API returns an order id at creation time that queryStatus later
  // needs). VNPay/MoMo/mock leave this undefined; their own id IS
  // paymentId, round-tripped back on the callback instead.
  gatewayRef?: string;
}

/** What the customer needs to make a manual bank transfer (SePay/VietQR) — shown by apps/web's checkout page. */
export interface BankTransferInstructions {
  qrImageUrl: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  amount: number;
  /** Must appear in the transfer content verbatim — it's how the incoming transfer is matched back to the Payment. */
  transferContent: string;
}

/**
 * A payment gateway needs 4 operations for this system's flow
 * (docs/spec/08-api-contracts.md §4): start a payment (redirect URL),
 * verify+parse the async callback, execute a refund, and query a payment's
 * current status (the reconciliation poller in payments.service.ts —
 * docs/spec/12-resilience-and-failure-design.md "payment reconciliation
 * poller"). Four implementations: VnpaySandboxGateway, MomoGateway and
 * PaypalGateway (real integrations, one per GATEWAY_METHODS entry) and
 * MockGateway (deterministic local simulation that stands in for all three
 * when PAYMENT_GATEWAY_MODE=mock) — see
 * PaymentGatewayResolver for the dispatch logic and gateway.module.ts for
 * wiring.
 */
export interface PaymentGateway {
  buildPaymentUrl(input: BuildPaymentUrlInput): Promise<BuiltPaymentUrl>;
  // Async because PayPal's "callback" IS a server-to-server capture call
  // (see paypal.gateway.ts) — VNPay/MoMo/mock just verify a signature
  // synchronously and resolve immediately.
  // headers: only SePay authenticates via a header (Authorization: Apikey ...) rather than a signed body.
  verifyCallback(params: Record<string, string>, headers?: Record<string, string | string[] | undefined>): Promise<CallbackOutcome>;
  refund(input: RefundInput): Promise<RefundOutcome>;
  queryStatus(input: QueryStatusInput): Promise<QueryStatusOutcome>;
  /** Only for gateways where the customer pays outside a hosted checkout page (SePay bank transfer). */
  bankTransferInstructions?(input: { paymentId: string; amount: number }): BankTransferInstructions;
}
