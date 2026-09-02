export const PAYMENT_GATEWAY = Symbol("PAYMENT_GATEWAY");

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

/**
 * A payment gateway needs 4 operations for this system's flow
 * (docs/spec/08-api-contracts.md §4): start a payment (redirect URL),
 * verify+parse the async callback, execute a refund, and query a payment's
 * current status (the reconciliation poller in payments.service.ts —
 * docs/spec/12-resilience-and-failure-design.md "payment reconciliation
 * poller"). Two implementations: VnpaySandboxGateway (the real VNPay
 * sandbox request/signature format) and MockGateway (deterministic local
 * simulation) — selected by PAYMENT_GATEWAY_MODE, see gateway.module.ts.
 */
export interface PaymentGateway {
  buildPaymentUrl(input: BuildPaymentUrlInput): Promise<string>;
  verifyCallback(params: Record<string, string>): CallbackOutcome;
  refund(input: RefundInput): Promise<RefundOutcome>;
  queryStatus(input: QueryStatusInput): Promise<QueryStatusOutcome>;
}
