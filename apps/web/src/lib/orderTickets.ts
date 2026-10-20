import type { EventItem, OrderItem, Refund } from "../api/types";

/** Human label for one order item (= one ticket): ticket type name for GA, "Ghế" for seated. */
export function orderItemLabel(item: OrderItem, event: EventItem | undefined, index: number): string {
  if (item.seatId) return `Ghế ${index + 1}`;
  const type = event?.ticketTypes?.find((t) => t.id === item.ticketTypeId);
  return `${type?.name ?? "Vé"} #${index + 1}`;
}

/** Refund statuses whose claim on their tickets still stands (mirrors refunds.service.ts OPEN_STATUSES + COMPLETED). */
export const CLAIMING_REFUND_STATUSES: Refund["status"][] = ["REQUESTED", "NEED_INFO", "ESCALATED", "APPROVED", "PROCESSING", "FAILED", "COMPLETED"];

/** Order item ids already refunded or awaiting a refund — an empty orderItemIds on a refund means the whole order. */
export function claimedItemIds(refunds: Refund[], allItemIds: string[]): Set<string> {
  const claimed = new Set<string>();
  for (const r of refunds) {
    if (!CLAIMING_REFUND_STATUSES.includes(r.status)) continue;
    (r.orderItemIds.length > 0 ? r.orderItemIds : allItemIds).forEach((id) => claimed.add(id));
  }
  return claimed;
}
