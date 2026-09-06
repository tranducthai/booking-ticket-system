import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac } from "crypto";
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

/**
 * Real MoMo "AIO" (all-in-one) integration — https://developers.momo.vn,
 * "Payment via Wallet" v2 flow. Same posture as VnpaySandboxGateway: the
 * request/signature shape is built to spec, but MOMO_ACCESS_KEY/SECRET_KEY
 * in .env.example are placeholders — without a real MoMo test-merchant
 * account (developers.momo.vn signup) the create-payment call gets rejected
 * with a signature/partner error. PAYMENT_GATEWAY_MODE=mock (default) never
 * touches this class.
 *
 * MoMo signs 4 different operations with 4 different fixed field orders —
 * verified against developers.momo.vn's published field lists as of
 * 2026-09-05; reconfirm against their current docs before going live, they
 * do version these (this targets v2).
 */
@Injectable()
export class MomoGateway implements PaymentGateway {
  private readonly logger = new Logger(MomoGateway.name);
  private readonly partnerCode: string;
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly endpoint: string;
  private readonly redirectUrl: string;
  private readonly ipnUrl: string;

  constructor(private readonly config: ConfigService) {
    this.partnerCode = config.get<string>("MOMO_PARTNER_CODE") ?? "";
    this.accessKey = config.get<string>("MOMO_ACCESS_KEY") ?? "";
    this.secretKey = config.get<string>("MOMO_SECRET_KEY") ?? "";
    this.endpoint = config.get<string>("MOMO_ENDPOINT") ?? "https://test-payment.momo.vn/v2/gateway/api";
    this.redirectUrl = config.get<string>("MOMO_REDIRECT_URL") ?? "http://localhost:3000/payment/payments/return/momo";
    this.ipnUrl = config.get<string>("MOMO_IPN_URL") ?? "http://localhost:3004/payments/webhook/momo";
  }

  async buildPaymentUrl(input: BuildPaymentUrlInput): Promise<BuiltPaymentUrl> {
    const requestId = `${input.paymentId}-${Date.now()}`;
    const requestType = "captureWallet";
    const extraData = "";
    const rawSignature =
      `accessKey=${this.accessKey}&amount=${Math.round(input.amount)}&extraData=${extraData}` +
      `&ipnUrl=${this.ipnUrl}&orderId=${input.paymentId}&orderInfo=${input.orderInfo}` +
      `&partnerCode=${this.partnerCode}&redirectUrl=${this.redirectUrl}&requestId=${requestId}&requestType=${requestType}`;
    const signature = this.hmac(rawSignature);

    const body = {
      partnerCode: this.partnerCode,
      accessKey: this.accessKey,
      requestId,
      amount: String(Math.round(input.amount)),
      orderId: input.paymentId,
      orderInfo: input.orderInfo,
      redirectUrl: this.redirectUrl,
      ipnUrl: this.ipnUrl,
      extraData,
      requestType,
      signature,
      lang: "vi",
    };

    try {
      const res = await fetch(`${this.endpoint}/create`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      const json = (await res.json().catch(() => ({}))) as { payUrl?: string; resultCode?: number; message?: string };
      if (!json.payUrl) {
        throw new Error(`MoMo create-payment rejected: resultCode=${json.resultCode} ${json.message ?? ""}`);
      }
      return { redirectUrl: json.payUrl };
    } catch (err) {
      this.logger.error(`MoMo buildPaymentUrl failed: ${(err as Error).message}`);
      throw err;
    }
  }

  /**
   * Handles both entry points with the same field set: the browser
   * redirectUrl (GET query params) and the server-to-server ipnUrl (POST
   * JSON body) — MoMo uses an identical signature scheme for each, only the
   * transport differs, and the controller normalizes both into a flat
   * Record<string,string> before this is called.
   */
  async verifyCallback(params: Record<string, string>): Promise<CallbackOutcome> {
    const { signature, ...rest } = params;
    const rawSignature =
      `accessKey=${this.accessKey}&amount=${rest.amount}&extraData=${rest.extraData ?? ""}` +
      `&message=${rest.message}&orderId=${rest.orderId}&orderInfo=${rest.orderInfo}` +
      `&orderType=${rest.orderType}&partnerCode=${rest.partnerCode}&payType=${rest.payType}` +
      `&requestId=${rest.requestId}&responseTime=${rest.responseTime}&resultCode=${rest.resultCode}` +
      `&transId=${rest.transId}`;
    const expected = this.hmac(rawSignature);
    const valid = Boolean(signature) && expected === signature;
    const resultCode = rest.resultCode ?? "";
    return {
      valid,
      txnRef: rest.orderId,
      success: valid && resultCode === "0",
      gatewayTxnId: rest.transId,
      responseCode: resultCode,
      message: rest.message ?? `resultCode=${resultCode}`,
      raw: params,
    };
  }

  async refund(input: RefundInput): Promise<RefundOutcome> {
    // MoMo's refund is itself a new transaction (own orderId/requestId), distinct from the original payment's.
    const requestId = `RF-${input.paymentId}-${Date.now()}`;
    const refundOrderId = requestId;
    const rawSignature =
      `accessKey=${this.accessKey}&amount=${Math.round(input.amount)}&description=${input.orderInfo}` +
      `&orderId=${refundOrderId}&partnerCode=${this.partnerCode}&requestId=${requestId}&transId=${input.gatewayTxnId ?? ""}`;
    const signature = this.hmac(rawSignature);
    const body = {
      partnerCode: this.partnerCode,
      orderId: refundOrderId,
      requestId,
      amount: String(Math.round(input.amount)),
      transId: input.gatewayTxnId ?? "",
      lang: "vi",
      description: input.orderInfo,
      signature,
    };

    try {
      const res = await fetch(`${this.endpoint}/refund`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      const json = (await res.json().catch(() => ({}))) as { resultCode?: number; message?: string };
      const success = json.resultCode === 0;
      return { success, message: json.message ?? `resultCode=${json.resultCode}` };
    } catch (err) {
      this.logger.error(`MoMo refund call failed: ${(err as Error).message}`);
      return { success: false, message: "Could not reach MoMo refund API" };
    }
  }

  async queryStatus(input: QueryStatusInput): Promise<QueryStatusOutcome> {
    const requestId = `QR-${input.paymentId}-${Date.now()}`;
    const rawSignature = `accessKey=${this.accessKey}&orderId=${input.paymentId}&partnerCode=${this.partnerCode}&requestId=${requestId}`;
    const signature = this.hmac(rawSignature);
    const body = { partnerCode: this.partnerCode, requestId, orderId: input.paymentId, signature, lang: "vi" };

    try {
      const res = await fetch(`${this.endpoint}/query`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      const json = (await res.json().catch(() => ({}))) as { resultCode?: number; transId?: string };
      if (json.resultCode === 0) return { status: "SUCCEEDED", gatewayTxnId: json.transId ? String(json.transId) : undefined };
      if (json.resultCode === 1000 || json.resultCode === 1003) return { status: "PENDING" }; // still processing / user hasn't paid
      return { status: "FAILED", message: `resultCode=${json.resultCode}` };
    } catch (err) {
      this.logger.error(`MoMo query call failed: ${(err as Error).message}`);
      return { status: "PENDING" };
    }
  }

  private hmac(data: string): string {
    return createHmac("sha256", this.secretKey).update(data).digest("hex");
  }
}
