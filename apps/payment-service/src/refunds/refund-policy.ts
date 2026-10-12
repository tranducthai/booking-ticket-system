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
      /** Postponement refunds skip review — the organizer already accepted them by moving the date. */
      autoApprove: boolean;
      evidenceRequired: boolean;
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
    autoApprove: false,
    evidenceRequired: !!category && (policy.evidenceRequiredFor ?? []).includes(category),
  };
}

export function amountForPercent(grossAmount: number, percent: number) {
  const amount = Math.floor((grossAmount * percent) / 100);
  return { amount, feeAmount: grossAmount - amount };
}

function full(kind: RefundKind, grossAmount: number, autoApprove: boolean): RefundQuote {
  return { eligible: true, kind, percent: 100, grossAmount, amount: grossAmount, feeAmount: 0, autoApprove, evidenceRequired: false };
}

/** Defensive: the column is free-form JSON — anything malformed counts as "no customer refunds". */
function parsePolicy(raw: unknown): RefundPolicy {
  if (!raw || typeof raw !== "object") return DEFAULT_REFUND_POLICY;
  const candidate = raw as Partial<RefundPolicy>;
  if (typeof candidate.customerRefundable !== "boolean" || !Array.isArray(candidate.tiers)) return DEFAULT_REFUND_POLICY;
  const tiers = candidate.tiers.filter(
    (t) => typeof t?.minHoursBefore === "number" && typeof t?.percent === "number" && t.percent >= 0 && t.percent <= 100,
  );
  return { customerRefundable: candidate.customerRefundable, tiers, evidenceRequiredFor: candidate.evidenceRequiredFor };
}
