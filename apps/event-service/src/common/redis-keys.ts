/** Shared Redis key naming so the lock owner (holds module) and readers
 * (seat-map module, for self-healing stale HELD rows) agree on the format. */
export function seatHoldKey(seatId: string): string {
  return `seat:hold:${seatId}`;
}

export function ticketTypeReserveKey(ticketTypeId: string): string {
  return `ticket-type:reserve:${ticketTypeId}`;
}
