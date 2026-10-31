import { DEFAULT_REFUND_POLICY, RefundKind, RefundPolicy, RefundReasonCategory } from "@booking-ticket-system/event-contracts";

/** The slice of event-service's GET /internal/events/:id/refund-context the quote needs. */
export interface RefundEventContext {
  id: string;
  organizerId: string;
  title: string;
  status: string;
  startTime: string;
  refundPolicy: unknown;
  postponedAt: string | null;
  refundWindowEndsAt: string | null;
}

export type RefundQuote =
  | {
      eligible: true;
      kind: RefundKind;
      percent: number;
      grossAmount: number;
      amount: number;
      feeAmount: number;
      /**
       * Skips review: postponement refunds (the organizer already accepted
       * them by moving the date), and customer requests on events whose
       * organizer turned on RefundPolicy.autoApprove.
       */
      autoApprove: boolean;
    }
  | { eligible: false; message: string };

/**
 * docs/spec/13-refund-and-anti-fraud-design.md §2.1. Pure so it can be unit
 * tested and so the number shown to the customer before they submit
 * (GET /refunds/quote) is exactly what gets recorded.
 */
export function quoteRefund(
  event: RefundEventContext,
  grossAmount: number,
  now: Date,
  category?: RefundReasonCategory,
): RefundQuote {
  if (event.status === "CANCELED") {
    return { eligible: false, message: "Sự kiện đã bị hủy — vé được hoàn tự động 100%, không cần gửi yêu cầu" };
  }
  const startTime = new Date(event.startTime);
  if (now >= startTime) {
    return { eligible: false, message: "Sự kiện đã bắt đầu — không thể yêu cầu hoàn vé" };
  }

  if (event.postponedAt && event.refundWindowEndsAt && now <= new Date(event.refundWindowEndsAt)) {
    return full("EVENT_POSTPONED", grossAmount, true);
  }

  const policy = parsePolicy(event.refundPolicy);
  if (!policy.customerRefundable) {
    return { eligible: false, message: "Sự kiện này không hỗ trợ hoàn vé theo yêu cầu của khách" };
  }

  const hoursBefore = (startTime.getTime() - now.getTime()) / 3_600_000;
  const tier = [...policy.tiers].sort((a, b) => b.minHoursBefore - a.minHoursBefore).find((t) => hoursBefore >= t.minHoursBefore);
  if (!tier || tier.percent <= 0) {
    return { eligible: false, message: "Đã quá thời hạn hoàn vé theo chính sách của sự kiện" };
  }

  const amount = Math.floor((grossAmount * tier.percent) / 100);
  return {
    eligible: true,
    kind: "CUSTOMER_REQUEST",
    percent: tier.percent,
    grossAmount,
    amount,
    feeAmount: grossAmount - amount,
    autoApprove: policy.autoApprove === true,
  };
}

export interface PricedItem {
  id: string;
  price: number | string;
  quantity: number;
}

/**
 * What a subset of an order's tickets is worth out of what was actually
 * paid — per-ticket refunds. Pro rata on the item subtotal, so an order-level
 * discount is shared across its tickets. The LAST tickets of an order get
 * whatever is left (paid - already claimed), so rounding never makes the sum
 * of an order's refunds drift from what was paid.
 */
export function grossForItems(
  allItems: PricedItem[],
  selectedIds: string[],
  remainingIds: string[],
  paidAmount: number,
  claimedGross: number,
): number {
  const selected = new Set(selectedIds);
  if (remainingIds.length > 0 && remainingIds.every((id) => selected.has(id))) {
    return Math.max(0, paidAmount - claimedGross);
  }
  const subtotal = (items: PricedItem[]) => items.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);
  const orderSubtotal = subtotal(allItems);
  if (orderSubtotal <= 0) return 0;
  const share = Math.floor((paidAmount * subtotal(allItems.filter((i) => selected.has(i.id)))) / orderSubtotal);
  return Math.min(share, Math.max(0, paidAmount - claimedGross));
}

export function amountForPercent(grossAmount: number, percent: number) {
  const amount = Math.floor((grossAmount * percent) / 100);
  return { amount, feeAmount: grossAmount - amount };
}

function full(kind: RefundKind, grossAmount: number, autoApprove: boolean): RefundQuote {
  return { eligible: true, kind, percent: 100, grossAmount, amount: grossAmount, feeAmount: 0, autoApprove };
}

/** Defensive: the column is free-form JSON — anything malformed counts as "no customer refunds". */
function parsePolicy(raw: unknown): RefundPolicy {
  if (!raw || typeof raw !== "object") return DEFAULT_REFUND_POLICY;
  const candidate = raw as Partial<RefundPolicy>;
  if (typeof candidate.customerRefundable !== "boolean" || !Array.isArray(candidate.tiers)) return DEFAULT_REFUND_POLICY;
  const tiers = candidate.tiers.filter(
    (t) => typeof t?.minHoursBefore === "number" && typeof t?.percent === "number" && t.percent >= 0 && t.percent <= 100,
  );
  return {
    customerRefundable: candidate.customerRefundable,
    tiers,
    autoApprove: candidate.autoApprove === true,
  };
}
