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

/**
 * A payment gateway needs 3 operations for this system's flow
 * (docs/spec/08-api-contracts.md §4): start a payment (redirect URL),
 * verify+parse the async callback, and execute a refund. Two implementations:
 * VnpaySandboxGateway (the real VNPay sandbox request/signature format) and
 * MockGateway (deterministic local simulation) — selected by
 * PAYMENT_GATEWAY_MODE, see gateway.module.ts.
 */
export interface PaymentGateway {
  buildPaymentUrl(input: BuildPaymentUrlInput): Promise<string>;
  verifyCallback(params: Record<string, string>): CallbackOutcome;
  refund(input: RefundInput): Promise<RefundOutcome>;
}
