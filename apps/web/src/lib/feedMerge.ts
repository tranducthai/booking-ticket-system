/** One source's merge state — see useActivityFeed. */
export interface FeedSource<T> {
  buffer: T[]; // fetched, not yet emitted
  exhausted: boolean; // no more pages on the server
}

/**
 * K-way merge step (docs/spec/14-activity-log-design.md §4). Emits up to
 * `limit` items newest-first, but only while every source that may still
 * have items has a buffered head to compare — otherwise an unfetched item
 * of that source could be newer than what we'd emit. Mutates the buffers.
 */
export function mergeStep<T>(sources: FeedSource<T>[], limit: number, newer: (a: T, b: T) => boolean): { out: T[]; hasMore: boolean } {
  const live = () => sources.filter((s) => !s.exhausted || s.buffer.length > 0);
  const out: T[] = [];
  while (out.length < limit) {
    const candidates = live();
    if (candidates.length === 0 || candidates.some((s) => s.buffer.length === 0)) break;
    let best = candidates[0];
    for (const s of candidates) if (newer(s.buffer[0], best.buffer[0])) best = s;
    out.push(best.buffer.shift()!);
  }
  return { out, hasMore: live().length > 0 };
}
