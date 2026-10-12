import { ConfigService } from "@nestjs/config";
import { SepayGateway } from "./sepay.gateway";

const PAYMENT_ID = "1a2b3c4d-5e6f-4a1b-8c2d-0123456789ab";
const AUTH = { authorization: "Apikey secret-key" };

function gateway(env: Record<string, string> = {}) {
  const values: Record<string, string> = {
    SEPAY_BANK: "MBBank",
    SEPAY_ACCOUNT_NUMBER: "0123456789",
    SEPAY_ACCOUNT_NAME: "NGUYEN VAN A",
    SEPAY_WEBHOOK_API_KEY: "secret-key",
    SEPAY_PAYMENT_PREFIX: "TBX",
    ...env,
  };
  return new SepayGateway({ get: (k: string) => values[k] } as unknown as ConfigService);
}

function webhook(overrides: Record<string, unknown> = {}) {
  return {
    id: 92704,
    gateway: "MBBank",
    transactionDate: "2026-10-11 11:08:33",
    accountNumber: "0123456789",
    code: "TBX1A2B3C4D5E6F",
    content: "TBX1A2B3C4D5E6F chuyen tien",
    transferType: "in",
    transferAmount: 150000,
    referenceCode: "FT26012345678",
    ...overrides,
  } as unknown as Record<string, string>;
}

describe("SepayGateway", () => {
  it("puts the payment code in the QR transfer content", () => {
    const info = gateway().bankTransferInstructions({ paymentId: PAYMENT_ID, amount: 150000 });
    expect(info.transferContent).toBe("TBX1A2B3C4D5E6F");
    expect(info.qrImageUrl).toContain("des=TBX1A2B3C4D5E6F");
    expect(info.qrImageUrl).toContain("amount=150000");
  });

  it("matches an incoming transfer back to the payment id prefix with the paid amount", async () => {
    const outcome = await gateway().verifyCallback(webhook(), AUTH);
    expect(outcome).toMatchObject({
      valid: true,
      success: true,
      txnRef: "1a2b3c4d-5e6f",
      txnRefIsPrefix: true,
      gatewayTxnId: "92704",
      paidAmount: 150000,
    });
  });

  it("falls back to scanning the content when SePay sent no code", async () => {
    const outcome = await gateway().verifyCallback(webhook({ code: null, content: "MBVCB.123 tbx1a2b3c4d5e6f FT26" }), AUTH);
    expect(outcome.txnRef).toBe("1a2b3c4d-5e6f");
  });

  it("rejects a wrong or missing API key", async () => {
    expect((await gateway().verifyCallback(webhook(), { authorization: "Apikey nope" })).valid).toBe(false);
    expect((await gateway().verifyCallback(webhook(), {})).valid).toBe(false);
  });

  it("refuses every webhook when no API key is configured", async () => {
    const outcome = await gateway({ SEPAY_WEBHOOK_API_KEY: "" }).verifyCallback(webhook(), { authorization: "Apikey " });
    expect(outcome.valid).toBe(false);
  });

  it("ignores outgoing transfers and transfers without a payment code", async () => {
    expect((await gateway().verifyCallback(webhook({ transferType: "out" }), AUTH)).ignoredReason).toBeDefined();
    expect((await gateway().verifyCallback(webhook({ code: null, content: "tien nha thang 10" }), AUTH)).ignoredReason).toBeDefined();
  });

  it("never claims an automatic refund succeeded", async () => {
    const outcome = await gateway().refund({ paymentId: PAYMENT_ID, gatewayTxnId: "92704", amount: 150000, orderInfo: "x" });
    expect(outcome.success).toBe(false);
  });
});
