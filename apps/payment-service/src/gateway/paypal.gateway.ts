import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  BuildPaymentUrlInput,
  BuiltPaymentUrl,
  CallbackOutcome,
  PaymentGateway,
  QueryStatusInput,
  QueryStatusOutcome,
  RefundInput,
  RefundOutcome,
} from "./payment-gateway.interface";

interface PaypalOrder {
  id: string;
  status?: string;
  links?: { rel: string; href: string }[];
  purchase_units?: { reference_id?: string; payments?: { captures?: { id: string; status?: string }[] } }[];
}

/**
 * Real PayPal Checkout integration — REST Orders API v2
 * (https://developer.paypal.com/docs/api/orders/v2), sandbox base
 * https://api-m.sandbox.paypal.com. PAYPAL_CLIENT_ID/SECRET in
 * .env.example are placeholders — create a sandbox app at
 * developer.paypal.com/dashboard to get real ones; without them every call
 * here 401s at the OAuth step. PAYMENT_GATEWAY_MODE=mock (default) never
 * touches this class.
 *
 * Two things make PayPal shaped differently from the domestic gateways in
 * this file:
 *  1. PayPal doesn't support VND as a transaction currency at all, so this
 *     converts to PAYPAL_CURRENCY (USD by default) using a configured fixed
 *     rate (PAYPAL_VND_TO_USD_RATE) — there's no live FX feed wired up here,
 *     so the converted amount will drift from the real rate over time.
 *     Fine for a demo/sandbox; a production integration should pull a real
 *     rate instead of a static env var.
 *  2. There's no query-string signature to check on return — the
 *     "verification" IS a second, authenticated, server-to-server API call
 *     (capture the order), which is why verifyCallback is async in the
 *     shared interface. reference_id on the captured order is set to our
 *     own paymentId at creation time and echoed back by PayPal, so that's
 *     what's used to look the Payment row back up (txnRef) rather than
 *     PayPal's own order id.
 */
@Injectable()
export class PaypalGateway implements PaymentGateway {
  private readonly logger = new Logger(PaypalGateway.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly apiBase: string;
  private readonly currency: string;
  private readonly vndToUsdRate: number;
  private readonly returnUrl: string;
  private readonly cancelUrl: string;
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {
    this.clientId = config.get<string>("PAYPAL_CLIENT_ID") ?? "";
    this.clientSecret = config.get<string>("PAYPAL_CLIENT_SECRET") ?? "";
    this.apiBase = config.get<string>("PAYPAL_API_BASE") ?? "https://api-m.sandbox.paypal.com";
    this.currency = config.get<string>("PAYPAL_CURRENCY") ?? "USD";
    this.vndToUsdRate = Number(config.get<string>("PAYPAL_VND_TO_USD_RATE") ?? "25400");
    this.returnUrl = config.get<string>("PAYPAL_RETURN_URL") ?? "http://localhost:3000/payment/payments/return/paypal";
    this.cancelUrl = config.get<string>("PAYPAL_CANCEL_URL") ?? "http://localhost:5173/thanh-toan";
  }

  async buildPaymentUrl(input: BuildPaymentUrlInput): Promise<BuiltPaymentUrl> {
    const value = this.toPaypalAmount(input.amount);
    const order = await this.api<PaypalOrder>("/v2/checkout/orders", "POST", {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.paymentId,
          description: input.orderInfo.slice(0, 127), // PayPal caps description length
          amount: { currency_code: this.currency, value },
        },
      ],
      application_context: {
        // paymentId round-tripped in the query string too, as a second way
        // to find the Payment row if a future change stops trusting
        // reference_id — cheap redundancy, PayPal preserves extra query
        // params on return_url verbatim alongside its own token/PayerID.
        return_url: `${this.returnUrl}?paymentId=${encodeURIComponent(input.paymentId)}`,
        cancel_url: this.cancelUrl,
        user_action: "PAY_NOW",
      },
    });

    const approve = order.links?.find((l) => l.rel === "approve")?.href;
    if (!approve) {
      throw new Error(`PayPal create-order response had no "approve" link (order ${order.id})`);
    }
    return { redirectUrl: approve, gatewayRef: order.id };
  }

  /**
   * Only meaningful for the browser-return leg (params.token = the PayPal
   * order id PayPal itself appends to return_url). PayPal's real webhook
   * events (checkout-orders.approved/completed) are JSON with a different,
   * nested shape than this flat Record<string,string> — this codebase's
   * flow drives confirmation off the return leg instead (see
   * PaymentsController's GET return/:provider), same as VNPay/MoMo's return
   * leg, so a dedicated webhook-signature verifier for PayPal isn't wired
   * up here. Add one (POST /v1/notifications/verify-webhook-signature)
   * before relying on PayPal's async IPN as your sole confirmation source.
   */
  async verifyCallback(params: Record<string, string>): Promise<CallbackOutcome> {
    const orderId = params.token;
    const paymentId = params.paymentId;
    if (!orderId) {
      return { valid: false, txnRef: paymentId ?? "", success: false, responseCode: "MISSING_TOKEN", message: "No PayPal order token in callback", raw: params };
    }

    try {
      const captured = await this.api<PaypalOrder>(`/v2/checkout/orders/${orderId}/capture`, "POST");
      const unit = captured.purchase_units?.[0];
      const capture = unit?.payments?.captures?.[0];
      const success = captured.status === "COMPLETED" && capture?.status === "COMPLETED";
      return {
        valid: true, // this API call itself was bearer-token-authenticated; there's no separate signature to check
        txnRef: unit?.reference_id ?? paymentId ?? "",
        success,
        gatewayTxnId: capture?.id,
        responseCode: captured.status ?? "UNKNOWN",
        message: success ? "PayPal capture completed" : `PayPal order status=${captured.status}`,
        raw: captured as unknown as Record<string, unknown>,
      };
    } catch (err) {
      this.logger.error(`PayPal capture failed for order ${orderId}: ${(err as Error).message}`);
      return {
        valid: true,
        txnRef: paymentId ?? "",
        success: false,
        responseCode: "CAPTURE_FAILED",
        message: (err as Error).message,
        raw: params,
      };
    }
  }

  async refund(input: RefundInput): Promise<RefundOutcome> {
    if (!input.gatewayTxnId) {
      return { success: false, message: "No PayPal capture id on this payment — cannot refund" };
    }
    const value = this.toPaypalAmount(input.amount);
    try {
      const res = await this.api<{ id?: string; status?: string }>(
        `/v2/payments/captures/${input.gatewayTxnId}/refund`,
        "POST",
        { amount: { currency_code: this.currency, value }, note_to_payer: input.orderInfo.slice(0, 255) },
      );
      const success = res.status === "COMPLETED" || res.status === undefined; // PayPal omits status on some sandbox responses but still 200/201s
      return { success, gatewayRefundId: res.id, message: res.status ?? "Refund accepted" };
    } catch (err) {
      this.logger.error(`PayPal refund failed: ${(err as Error).message}`);
      return { success: false, message: (err as Error).message };
    }
  }

  async queryStatus(input: QueryStatusInput): Promise<QueryStatusOutcome> {
    if (!input.gatewayTxnId) return { status: "PENDING" }; // no PayPal order id captured yet — nothing to query
    try {
      const order = await this.api<PaypalOrder>(`/v2/checkout/orders/${input.gatewayTxnId}`, "GET");
      if (order.status === "COMPLETED") {
        const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
        return { status: "SUCCEEDED", gatewayTxnId: capture?.id };
      }
      if (order.status === "VOIDED") return { status: "FAILED", message: "PayPal order voided" };
      return { status: "PENDING" }; // CREATED / APPROVED / PAYER_ACTION_REQUIRED — not decided yet
    } catch (err) {
      this.logger.error(`PayPal queryStatus failed: ${(err as Error).message}`);
      return { status: "PENDING" };
    }
  }

  /** VND has no minor unit in PayPal's sense; this is purely a display-currency conversion for a gateway that can't charge VND directly. */
  private toPaypalAmount(vndAmount: number): string {
    return (vndAmount / this.vndToUsdRate).toFixed(2);
  }

  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now()) {
      return this.cachedToken.value;
    }
    const res = await fetch(`${this.apiBase}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      throw new Error(`PayPal OAuth token request failed with ${res.status}`);
    }
    const json = (await res.json()) as { access_token: string; expires_in: number };
    // Refresh a bit early rather than exactly at expiry.
    this.cachedToken = { value: json.access_token, expiresAt: Date.now() + (json.expires_in - 60) * 1000 };
    return json.access_token;
  }

  private async api<T>(path: string, method: string, body?: unknown): Promise<T> {
    const token = await this.getAccessToken();
    const res = await fetch(`${this.apiBase}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) {
      throw new Error(`PayPal API ${method} ${path} failed with ${res.status}: ${text.slice(0, 300)}`);
    }
    return json as T;
  }
}
