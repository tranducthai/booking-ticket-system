const KEY = "ticketbox.queueSession";

/** Stable per-browser id for the waiting room (docs/spec/11-implementation-roadmap.md Phase 8b) — same id across a page reload so a queue position isn't lost. */
export function getQueueSessionId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
