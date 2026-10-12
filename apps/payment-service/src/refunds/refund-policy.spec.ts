import { quoteRefund, RefundEventContext } from "./refund-policy";

const now = new Date("2026-10-10T00:00:00Z");
const hoursFromNow = (h: number) => new Date(now.getTime() + h * 3_600_000).toISOString();

function event(overrides: Partial<RefundEventContext> = {}): RefundEventContext {
  return {
    id: "e1",
    organizerId: "o1",
    title: "Concert",
    status: "PUBLISHED",
    startTime: hoursFromNow(10 * 24),
    refundPolicy: {
      customerRefundable: true,
      tiers: [
        { minHoursBefore: 168, percent: 80 },
        { minHoursBefore: 72, percent: 50 },
        { minHoursBefore: 0, percent: 0 },
      ],
      evidenceRequiredFor: ["MEDICAL"],
    },
    postponedAt: null,
    refundWindowEndsAt: null,
    ...overrides,
  };
}

describe("quoteRefund", () => {
  it("applies the highest tier the request still satisfies", () => {
    expect(quoteRefund(event(), 1_000_000, now)).toMatchObject({ eligible: true, percent: 80, amount: 800_000, feeAmount: 200_000 });
    expect(quoteRefund(event({ startTime: hoursFromNow(100) }), 1_000_000, now)).toMatchObject({ percent: 50, amount: 500_000 });
  });

  it("refuses inside a 0% tier", () => {
    expect(quoteRefund(event({ startTime: hoursFromNow(10) }), 1_000_000, now)).toMatchObject({ eligible: false });
  });

  it("defaults to no customer refunds when the event has no policy (Ticketbox default)", () => {
    expect(quoteRefund(event({ refundPolicy: null }), 1_000_000, now)).toMatchObject({ eligible: false });
  });

  it("treats a malformed policy as no policy", () => {
    expect(quoteRefund(event({ refundPolicy: { tiers: "nope" } }), 1_000_000, now)).toMatchObject({ eligible: false });
  });

  it("gives 100% with no review inside a postponement window, whatever the policy says", () => {
    const q = quoteRefund(event({ refundPolicy: null, postponedAt: now.toISOString(), refundWindowEndsAt: hoursFromNow(24) }), 500_000, now);
    expect(q).toMatchObject({ eligible: true, kind: "EVENT_POSTPONED", percent: 100, amount: 500_000, autoApprove: true });
  });

  it("falls back to the normal policy once the postponement window closed", () => {
    const q = quoteRefund(event({ postponedAt: hoursFromNow(-48), refundWindowEndsAt: hoursFromNow(-1) }), 1_000_000, now);
    expect(q).toMatchObject({ kind: "CUSTOMER_REQUEST", percent: 80 });
  });

  it("requires evidence only for the configured categories", () => {
    expect(quoteRefund(event(), 1, now, "MEDICAL")).toMatchObject({ evidenceRequired: true });
    expect(quoteRefund(event(), 1, now, "PERSONAL")).toMatchObject({ evidenceRequired: false });
  });

  it("refuses once the event started or was canceled", () => {
    expect(quoteRefund(event({ startTime: hoursFromNow(-1) }), 1, now)).toMatchObject({ eligible: false });
    expect(quoteRefund(event({ status: "CANCELED" }), 1, now)).toMatchObject({ eligible: false });
  });

  it("never refunds a fraction of a dong", () => {
    const q = quoteRefund(event(), 333_333, now);
    expect(q).toMatchObject({ amount: 266_666, feeAmount: 66_667 });
  });
});
