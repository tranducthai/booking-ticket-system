import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac } from "crypto";
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
 * Real VNPay sandbox integration — https://sandbox.vnpayment.vn (the gateway
 * docs/spec/05-project-structure-and-tech-stack.md names as "most commonly
 * documented for VN student projects"). Verified against VNPay's own
 * published docs (sandbox.vnpayment.vn/apis/docs) on 2026-09-02:
 *   - pay: sign = HMAC-SHA512(vnp_HashSecret, alphabetically-sorted,
 *     URL-encoded "key=value&..." query string).
 *   - return/IPN verification: identical algorithm, over the callback's own
 *     params minus vnp_SecureHash.
 *   - refund: sign = HMAC-SHA512(vnp_HashSecret, a FIXED pipe-delimited
 *     concatenation, NOT the sorted-query-string format above).
 * VNPAY_TMN_CODE/VNPAY_HASH_SECRET are sandbox placeholders in .env.example —
 * without a real merchant sandbox account this class builds a correctly
 * *formed* request/signature but VNPay will reject the TMN code. The
 * MockGateway (mock.gateway.ts) is what local dev/demo actually runs against
 * by default (PAYMENT_GATEWAY_MODE=mock) — see gateway.module.ts.
 */
@Injectable()
export class VnpaySandboxGateway implements PaymentGateway {
  private readonly logger = new Logger(VnpaySandboxGateway.name);
  private readonly tmnCode: string;
  private readonly hashSecret: string;
  private readonly returnUrl: string;
  private readonly payUrl: string;
  private readonly refundApiUrl: string;

  constructor(private readonly config: ConfigService) {
    this.tmnCode = config.get<string>("VNPAY_TMN_CODE") ?? "";
    this.hashSecret = config.get<string>("VNPAY_HASH_SECRET") ?? "";
    this.returnUrl = config.get<string>("VNPAY_RETURN_URL") ?? "http://localhost:3000/payment/return";
    this.payUrl = config.get<string>("VNPAY_PAY_URL") ?? "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
    // Confirm this against your merchant account's actual API docs before
    // relying on it — VNPay's refund endpoint wasn't fully confirmable from
    // the public sandbox docs alone at the time this was written.
    this.refundApiUrl = config.get<string>("VNPAY_REFUND_API_URL") ?? "https://sandbox.vnpayment.vn/merchant_webapi/api/transaction";
  }

  async buildPaymentUrl(input: BuildPaymentUrlInput): Promise<string> {
    const now = new Date();
    const expire = new Date(now.getTime() + 15 * 60 * 1000);
    const params: Record<string, string> = {
      vnp_Version: "2.1.0",
      vnp_Command: "pay",
      vnp_TmnCode: this.tmnCode,
      vnp_Amount: String(Math.round(input.amount * 100)),
      vnp_CreateDate: formatVnpDate(now),
      vnp_CurrCode: "VND",
      vnp_IpAddr: input.ipAddr,
      vnp_Locale: "vn",
      vnp_OrderInfo: input.orderInfo,
      vnp_OrderType: "other",
      vnp_ReturnUrl: this.returnUrl,
      vnp_TxnRef: input.paymentId,
      vnp_ExpireDate: formatVnpDate(expire),
    };
    const signed = this.sign(params);
    return `${this.payUrl}?${toQueryString(signed)}`;
  }

  verifyCallback(params: Record<string, string>): CallbackOutcome {
    const { vnp_SecureHash, vnp_SecureHashType, ...rest } = params;
    const expected = this.hmac(sortedQueryString(rest));
    const valid = Boolean(vnp_SecureHash) && expected === vnp_SecureHash;
    const responseCode = params.vnp_ResponseCode ?? "";
    return {
      valid,
      txnRef: params.vnp_TxnRef,
      success: valid && (responseCode === "00" || responseCode === "02"),
      gatewayTxnId: params.vnp_TransactionNo,
      responseCode,
      message: responseCodeMessage(responseCode),
      raw: params,
    };
  }

  async refund(input: RefundInput): Promise<RefundOutcome> {
    const now = new Date();
    const requestId = `RF${now.getTime()}`;
    const fields = {
      vnp_RequestId: requestId,
      vnp_Version: "2.1.0",
      vnp_Command: "refund",
      vnp_TmnCode: this.tmnCode,
      vnp_TransactionType: "02", // full refund
      vnp_TxnRef: input.paymentId,
      vnp_Amount: String(Math.round(input.amount * 100)),
      vnp_TransactionNo: input.gatewayTxnId ?? "",
      vnp_TransactionDate: formatVnpDate(now),
      vnp_CreateBy: "system",
      vnp_CreateDate: formatVnpDate(now),
      vnp_IpAddr: "127.0.0.1",
      vnp_OrderInfo: input.orderInfo,
    };
    // Refund uses a fixed pipe-delimited hash string, NOT the sorted
    // query-string format the pay/return APIs use.
    const hashData = [
      fields.vnp_RequestId,
      fields.vnp_Version,
      fields.vnp_Command,
      fields.vnp_TmnCode,
      fields.vnp_TransactionType,
      fields.vnp_TxnRef,
      fields.vnp_Amount,
      fields.vnp_TransactionNo,
      fields.vnp_TransactionDate,
      fields.vnp_CreateBy,
      fields.vnp_CreateDate,
      fields.vnp_IpAddr,
      fields.vnp_OrderInfo,
    ].join("|");
    const vnp_SecureHash = this.hmac(hashData);

    try {
      const res = await fetch(this.refundApiUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...fields, vnp_SecureHash }),
      });
      const body = (await res.json().catch(() => ({}))) as { vnp_ResponseCode?: string; vnp_Message?: string };
      const success = body.vnp_ResponseCode === "00";
      return { success, message: body.vnp_Message ?? `vnp_ResponseCode=${body.vnp_ResponseCode}` };
    } catch (err) {
      this.logger.error(`VNPay refund call failed: ${(err as Error).message}`);
      return { success: false, message: "Could not reach VNPay refund API" };
    }
  }

  /**
   * VNPay's querydr API — verified against sandbox.vnpayment.vn/apis/docs
   * (2026-09-02). Sign is yet ANOTHER fixed pipe-delimited format, distinct
   * from both pay/return's sorted-query-string and refund's own field list.
   */
  async queryStatus(input: QueryStatusInput): Promise<QueryStatusOutcome> {
    const now = new Date();
    const fields = {
      vnp_RequestId: `QR${now.getTime()}`,
      vnp_Version: "2.1.0",
      vnp_Command: "querydr",
      vnp_TmnCode: this.tmnCode,
      vnp_TxnRef: input.paymentId,
      vnp_OrderInfo: input.orderInfo,
      vnp_TransactionDate: formatVnpDate(input.transactionDate),
      vnp_CreateDate: formatVnpDate(now),
      vnp_IpAddr: "127.0.0.1",
    };
    const hashData = [
      fields.vnp_RequestId,
      fields.vnp_Version,
      fields.vnp_Command,
      fields.vnp_TmnCode,
      fields.vnp_TxnRef,
      fields.vnp_TransactionDate,
      fields.vnp_CreateDate,
      fields.vnp_IpAddr,
      fields.vnp_OrderInfo,
    ].join("|");
    const vnp_SecureHash = this.hmac(hashData);

    try {
      const res = await fetch(this.refundApiUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...fields, vnp_SecureHash }),
        signal: AbortSignal.timeout(10000),
      });
      const body = (await res.json().catch(() => ({}))) as {
        vnp_ResponseCode?: string;
        vnp_TransactionStatus?: string;
        vnp_TransactionNo?: string;
      };
      if (body.vnp_TransactionStatus === "00") return { status: "SUCCEEDED", gatewayTxnId: body.vnp_TransactionNo };
      if (body.vnp_TransactionStatus && body.vnp_TransactionStatus !== "01") {
        return { status: "FAILED", message: `vnp_TransactionStatus=${body.vnp_TransactionStatus}` };
      }
      return { status: "PENDING" };
    } catch (err) {
      this.logger.error(`VNPay querydr call failed: ${(err as Error).message}`);
      return { status: "PENDING" }; // treat an unreachable gateway as "don't know yet", not a decision
    }
  }

  private sign(params: Record<string, string>): Record<string, string> {
    return { ...params, vnp_SecureHash: this.hmac(sortedQueryString(params)) };
  }

  private hmac(data: string): string {
    return createHmac("sha512", this.hashSecret).update(Buffer.from(data, "utf-8")).digest("hex");
  }
}

function sortedQueryString(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== "")
    .sort()
    .map((k) => `${k}=${encodeURIComponent(params[k])}`)
    .join("&");
}

function toQueryString(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(params[k])}`)
    .join("&");
}

function formatVnpDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function responseCodeMessage(code: string): string {
  const known: Record<string, string> = {
    "00": "Transaction successful",
    "02": "Transaction successful (confirmed)",
    "01": "Transaction not yet completed",
    "04": "Reversed transaction",
    "97": "Invalid signature",
    "99": "Unknown error",
  };
  return known[code] ?? `Unrecognized vnp_ResponseCode=${code}`;
}
