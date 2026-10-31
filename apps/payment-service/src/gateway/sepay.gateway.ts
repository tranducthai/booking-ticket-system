import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "crypto";
import {
  BankTransferInstructions,
  BuildPaymentUrlInput,
  BuiltPaymentUrl,
  CallbackOutcome,
  PaymentGateway,
  QueryStatusInput,
  QueryStatusOutcome,
  RefundInput,
  RefundOutcome,
} from "./payment-gateway.interface";

interface SepayTransaction {
  id: string | number;
  transaction_content?: string;
  code?: string | null;
  amount_in?: string | number;
}

/**
 * Real-money bank transfer via SePay (https://docs.sepay.vn) — the one
 * option here an individual (no business licence) can actually go live
 * with: VNPay/MoMo/PayPal production merchant accounts all need a legal
 * entity, SePay just watches YOUR OWN personal bank account.
 *
 * Flow — no hosted checkout page, the customer pays from their banking app:
 *  1. buildPaymentUrl sends the shopper to apps/web's checkout page, which
 *     shows a VietQR (bankTransferInstructions) with the exact amount and a
 *     transfer content carrying this payment's code.
 *  2. SePay sees the incoming transfer on the linked account and POSTs it to
 *     /payments/webhook/sepay, authenticated by `Authorization: Apikey <key>`
 *     (the "API Key" option in SePay's webhook settings).
 *  3. verifyCallback matches the code in the content back to the Payment;
 *     PaymentsService.applyOutcome checks the amount and drives the Saga.
 *  4. If the webhook never arrives (tunnel down, SePay retries exhausted),
 *     queryStatus — the reconciliation cron — finds the transfer through
 *     SePay's transaction API instead (needs SEPAY_API_TOKEN).
 *
 * Refunds: SePay only READS the bank account, it can't send money, so
 * refund() always reports failure — an admin has to transfer it back by hand.
 *
 * Payment code = SEPAY_PAYMENT_PREFIX + the first 12 hex digits of
 * Payment.id, uppercased (e.g. TBX1A2B3C4D5E6F). Configure the SAME prefix
 * in SePay ("Cấu hình công ty → Cấu hình chung → Mã thanh toán") so it fills
 * the webhook's `code` field; the content is regex-scanned as a fallback.
 * 48 bits of a random UUID — collisions aren't a practical concern at this scale.
 */
@Injectable()
export class SepayGateway implements PaymentGateway {
  readonly manualRefund = true;
  private readonly logger = new Logger(SepayGateway.name);
  private readonly bank: string;
  private readonly accountNumber: string;
  private readonly accountName: string;
  private readonly webhookApiKey: string;
  private readonly apiToken: string;
  private readonly apiBase: string;
  private readonly qrBaseUrl: string;
  private readonly prefix: string;
  private readonly frontendUrl: string;
  private readonly codePattern: RegExp;

  constructor(config: ConfigService) {
    this.bank = config.get<string>("SEPAY_BANK") ?? "";
    this.accountNumber = config.get<string>("SEPAY_ACCOUNT_NUMBER") ?? "";
    this.accountName = config.get<string>("SEPAY_ACCOUNT_NAME") ?? "";
    this.webhookApiKey = config.get<string>("SEPAY_WEBHOOK_API_KEY") ?? "";
    this.apiToken = config.get<string>("SEPAY_API_TOKEN") ?? "";
    this.apiBase = config.get<string>("SEPAY_API_BASE") ?? "https://my.sepay.vn/userapi";
    this.qrBaseUrl = config.get<string>("SEPAY_QR_BASE_URL") ?? "https://vietqr.app/img";
    this.frontendUrl = config.get<string>("FRONTEND_URL") ?? "http://localhost:5173";
    // Letters/digits only: it's typed into banking apps, and goes into a RegExp below.
    this.prefix = (config.get<string>("SEPAY_PAYMENT_PREFIX") ?? "TBX").toUpperCase().replace(/[^A-Z0-9]/g, "");
    this.codePattern = new RegExp(`${this.prefix}([0-9A-F]{12})`, "i");
  }

  async buildPaymentUrl(input: BuildPaymentUrlInput): Promise<BuiltPaymentUrl> {
    if (!this.bank || !this.accountNumber || !this.webhookApiKey) {
      // Fail before the customer transfers money we'd have no way to match.
      throw new ServiceUnavailableException("Chuyển khoản ngân hàng chưa được cấu hình (SEPAY_BANK / SEPAY_ACCOUNT_NUMBER / SEPAY_WEBHOOK_API_KEY)");
    }
    return {
      redirectUrl: `${this.frontendUrl}/checkout/${input.orderId}?chuyen-khoan=${encodeURIComponent(input.paymentId)}`,
    };
  }

  bankTransferInstructions(input: { paymentId: string; amount: number }): BankTransferInstructions {
    const amount = Math.round(input.amount);
    const transferContent = this.paymentCode(input.paymentId);
    const qs = new URLSearchParams({
      acc: this.accountNumber,
      bank: this.bank,
      amount: String(amount),
      des: transferContent,
      template: "compact",
    });
    return {
      qrImageUrl: `${this.qrBaseUrl}?${qs.toString()}`,
      bankName: this.bank,
      accountNumber: this.accountNumber,
      accountName: this.accountName,
      amount,
      transferContent,
    };
  }

  async verifyCallback(
    params: Record<string, string>,
    headers?: Record<string, string | string[] | undefined>,
  ): Promise<CallbackOutcome> {
    const raw = params as Record<string, unknown>;
    const base = { txnRef: "", success: false, responseCode: "", raw };

    if (!this.isAuthorized(headers?.authorization)) {
      return { ...base, valid: false, message: "Invalid SePay API key" };
    }
    if (params.transferType !== "in") {
      return { ...base, valid: true, message: "Outgoing transfer", ignoredReason: "outgoing transfer" };
    }

    const hex = this.extractCode(params.code) ?? this.extractCode(params.content);
    if (!hex) {
      return { ...base, valid: true, message: "No payment code in transfer content", ignoredReason: "no payment code" };
    }

    return {
      valid: true,
      txnRef: idPrefixFromHex(hex),
      txnRefIsPrefix: true,
      success: true,
      gatewayTxnId: String(params.id),
      paidAmount: Number(params.transferAmount),
      responseCode: "in",
      message: `Bank transfer received (${params.gateway ?? "bank"} ref ${params.referenceCode ?? "?"})`,
      raw,
    };
  }

  async refund(_input: RefundInput): Promise<RefundOutcome> {
    return {
      success: false,
      message: "SePay không hỗ trợ hoàn tiền tự động — cần chuyển khoản hoàn lại cho khách thủ công",
    };
  }

  async queryStatus(input: QueryStatusInput): Promise<QueryStatusOutcome> {
    if (!this.apiToken) return { status: "PENDING" }; // reconciliation is optional — webhook-only setups skip it
    // A transfer days after checkout is past any seat hold anyway; stop polling SePay for it.
    if (Date.now() - input.transactionDate.getTime() > 3 * 24 * 60 * 60 * 1000) return { status: "PENDING" };

    const qs = new URLSearchParams({
      account_number: this.accountNumber,
      transaction_date_min: vnDate(input.transactionDate),
      limit: "200",
    });
    try {
      const res = await fetch(`${this.apiBase}/transactions/list?${qs.toString()}`, {
        headers: { authorization: `Bearer ${this.apiToken}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { transactions?: SepayTransaction[] };
      const wanted = input.paymentId.replace(/-/g, "").slice(0, 12).toUpperCase();
      const match = (json.transactions ?? []).find(
        (t) => Number(t.amount_in) > 0 && (this.extractCode(t.code) ?? this.extractCode(t.transaction_content)) === wanted,
      );
      if (!match) return { status: "PENDING" };
      return { status: "SUCCEEDED", gatewayTxnId: String(match.id), paidAmount: Number(match.amount_in) };
    } catch (err) {
      this.logger.error(`SePay transactions query failed: ${(err as Error).message}`);
      return { status: "PENDING" };
    }
  }

  /** What the customer types as transfer content — also what SePay's `code` field should come back as. */
  private paymentCode(paymentId: string): string {
    return `${this.prefix}${paymentId.replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  }

  /** The 12 hex digits after the prefix, uppercased — or null if the text carries no payment code. */
  private extractCode(text: string | null | undefined): string | null {
    if (!text) return null;
    const m = this.codePattern.exec(String(text).replace(/\s+/g, ""));
    return m ? m[1].toUpperCase() : null;
  }

  private isAuthorized(header: string | string[] | undefined): boolean {
    // No key configured = refuse everything: an open webhook would let anyone mark an order paid.
    if (!this.webhookApiKey || typeof header !== "string") return false;
    const expected = Buffer.from(`Apikey ${this.webhookApiKey}`);
    const actual = Buffer.from(header.trim());
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}

/** "1A2B3C4D5E6F" -> "1a2b3c4d-5e6f" — the matching prefix of a lowercase UUID Payment.id. */
function idPrefixFromHex(hex: string): string {
  const h = hex.toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}`;
}

/** yyyy-mm-dd in Vietnam time — SePay's transaction dates are local (GMT+7), whatever TZ this process runs in. */
function vnDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(d);
}
