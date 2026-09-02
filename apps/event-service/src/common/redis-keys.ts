/** Shared Redis key naming so the lock owner (holds module) and readers
 * (seat-map module, for self-healing stale HELD rows) agree on the format. */
export function seatHoldKey(seatId: string): string {
  return `seat:hold:${seatId}`;
}

export function ticketTypeReserveKey(ticketTypeId: string): string {
  return `ticket-type:reserve:${ticketTypeId}`;
}

/** Set of seatIds currently held by this user for this event — per-user-per-event cap (12-resilience-and-failure-design.md). */
export function userEventHoldsKey(userId: string, eventId: string): string {
  return `user-event-holds:${userId}:${eventId}`;
}

export function eventCacheKey(eventId: string): string {
  return `event:${eventId}`;
}

export function searchCacheKey(queryKey: string): string {
  return `search:${queryKey}`;
}

export function seatMapLayoutKey(eventId: string): string {
  return `seatmap:layout:${eventId}`;
}

export function seatMapStateKey(eventId: string): string {
  return `seatmap:state:${eventId}`;
}
