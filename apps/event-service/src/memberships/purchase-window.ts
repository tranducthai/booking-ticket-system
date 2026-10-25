/**
 * When a purchase is allowed. A ticket type's own window (salesStart/salesEnd)
 * wins over the event's (salesStartTime/salesEndTime); with neither, sales
 * open at once and close when the event ends. Seats sell on the event's
 * window. A member's presale moves the opening earlier by `presaleHours`.
 */
export interface SalesWindow {
  salesStart: Date | null;
  salesEnd: Date | null;
}

export interface PurchaseWindowInput {
  now: Date;
  event: { salesStartTime: Date | null; salesEndTime: Date | null; endTime: Date };
  /** The ticket types being bought; empty when only seats are. */
  tiers: SalesWindow[];
  includesSeats: boolean;
  /** 0 = not a member (or the event has no member benefits). */
  presaleHours: number;
}

export type PurchaseWindowResult = { ok: true; presale: boolean } | { ok: false; reason: string };

const HOUR = 3_600_000;

export function formatVnTime(d: Date): string {
  return d.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function checkPurchaseWindow(input: PurchaseWindowInput): PurchaseWindowResult {
  const { now, event } = input;
  const windows: SalesWindow[] = [
    ...input.tiers.map((t) => ({ salesStart: t.salesStart ?? event.salesStartTime, salesEnd: t.salesEnd ?? event.salesEndTime })),
    ...(input.includesSeats ? [{ salesStart: event.salesStartTime, salesEnd: event.salesEndTime }] : []),
  ];

  let presale = false;
  for (const w of windows) {
    const close = w.salesEnd ?? event.endTime;
    if (now.getTime() >= close.getTime()) return { ok: false, reason: "Đã hết thời gian bán vé" };
    if (w.salesStart && now.getTime() < w.salesStart.getTime()) {
      const presaleOpen = new Date(w.salesStart.getTime() - input.presaleHours * HOUR);
      if (input.presaleHours > 0 && now.getTime() >= presaleOpen.getTime()) {
        presale = true;
        continue;
      }
      return {
        ok: false,
        reason:
          input.presaleHours > 0
            ? `Chưa mở bán — thành viên được mua sớm từ ${formatVnTime(presaleOpen)}`
            : `Chưa mở bán — vé mở bán lúc ${formatVnTime(w.salesStart)}`,
      };
    }
  }
  return { ok: true, presale };
}
