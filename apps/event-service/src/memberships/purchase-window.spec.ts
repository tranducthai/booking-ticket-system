import { checkPurchaseWindow } from "./purchase-window";

const H = 3_600_000;
const now = new Date("2026-11-01T12:00:00Z");
const at = (hours: number) => new Date(now.getTime() + hours * H);
const event = { salesStartTime: null, salesEndTime: null, endTime: at(24 * 30) };

describe("checkPurchaseWindow", () => {
  it("is open when no window is set", () => {
    expect(checkPurchaseWindow({ now, event, tiers: [{ salesStart: null, salesEnd: null }], includesSeats: false, presaleHours: 0 })).toEqual({ ok: true, presale: false });
  });

  it("refuses before the event-level opening", () => {
    const r = checkPurchaseWindow({ now, event: { ...event, salesStartTime: at(5) }, tiers: [], includesSeats: true, presaleHours: 0 });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain("Chưa mở bán");
  });

  it("lets a member in during the presale", () => {
    const r = checkPurchaseWindow({ now, event: { ...event, salesStartTime: at(5) }, tiers: [], includesSeats: true, presaleHours: 48 });
    expect(r).toEqual({ ok: true, presale: true });
  });

  it("refuses a member before the presale opens, naming when it does", () => {
    const r = checkPurchaseWindow({ now, event, tiers: [{ salesStart: at(72), salesEnd: null }], includesSeats: false, presaleHours: 48 });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain("thành viên được mua sớm");
  });

  it("uses the tier's own window over the event's", () => {
    const r = checkPurchaseWindow({ now, event: { ...event, salesStartTime: at(10) }, tiers: [{ salesStart: at(-1), salesEnd: null }], includesSeats: false, presaleHours: 0 });
    expect(r.ok).toBe(true);
  });

  it("refuses once sales closed, presale or not", () => {
    const r = checkPurchaseWindow({ now, event, tiers: [{ salesStart: null, salesEnd: at(-1) }], includesSeats: false, presaleHours: 48 });
    expect(r).toEqual({ ok: false, reason: "Đã hết thời gian bán vé" });
  });

  it("lets late sales reopen a closed window until lateSalesUntil", () => {
    const closed = { ...event, salesEndTime: at(-5) };
    expect(checkPurchaseWindow({ now, event: { ...closed, lateSalesUntil: at(10) }, tiers: [], includesSeats: true, presaleHours: 0 })).toEqual({ ok: true, presale: false, late: true });
    expect(checkPurchaseWindow({ now, event: { ...closed, lateSalesUntil: at(-1) }, tiers: [], includesSeats: true, presaleHours: 0 }).ok).toBe(false);
  });

  it("closes at the event end by default", () => {
    const r = checkPurchaseWindow({ now, event: { ...event, endTime: at(-2) }, tiers: [], includesSeats: true, presaleHours: 0 });
    expect(r.ok).toBe(false);
  });
});
