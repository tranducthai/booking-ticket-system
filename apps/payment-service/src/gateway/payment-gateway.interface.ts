/** Real, wired-up gateways — dispatch key doubles as the `:provider` path segment and the Payment.method value (docs/spec/08-api-contracts.md §4). */
export const GATEWAY_METHODS = ["vnpay", "momo", "paypal"] as const;
export type GatewayMethod = (typeof GATEWAY_METHODS)[number];

export interface BuildPaymentUrlInput {
  paymentId: string;
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
}

export interface RefundInput {
  paymentId: string;
  gatewayTxnId: string | null;
  amount: number;
  orderInfo: string;
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
  | { status: "SUCCEEDED"; gatewayTxnId?: string }
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
  verifyCallback(params: Record<string, string>): Promise<CallbackOutcome>;
  refund(input: RefundInput): Promise<RefundOutcome>;
  queryStatus(input: QueryStatusInput): Promise<QueryStatusOutcome>;
}
