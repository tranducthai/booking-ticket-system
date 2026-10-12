import { useCallback, useEffect, useRef, useState } from "react";
import { apiErrorMessage } from "../api/client";
import { fetchActivityPage, type ActivityLog, type ActivityScope, type ActivitySource } from "../api/activity";
import { mergeStep } from "../lib/feedMerge";

interface SourceState {
  buffer: ActivityLog[]; // fetched, not yet shown
  cursor?: string; // passed as `before` on the next fetch
  exhausted: boolean;
  error?: string;
}

function newer(a: ActivityLog, b: ActivityLog): boolean {
  return a.createdAt !== b.createdAt ? a.createdAt > b.createdAt : a.id > b.id;
}

/**
 * Merges several services' activity feeds into one time-ordered list —
 * docs/spec/14-activity-log-design.md §4. A cursor PER SOURCE: each source
 * is refilled only when its buffer runs dry, and lib/feedMerge.ts emits an
 * item only while every still-live source has a buffered head to compare
 * against, so ordering is exact across pages. A source that
 * errors (service down) is reported and dropped instead of blanking the
 * whole feed.
 */
export function useActivityFeed(scope: ActivityScope, sources: ActivitySource[], pageSize = 30) {
  const [items, setItems] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [errors, setErrors] = useState<Partial<Record<ActivitySource, string>>>({});
  const state = useRef<Map<ActivitySource, SourceState>>(new Map());
  const generation = useRef(0);
  const scopeKey = JSON.stringify(scope) + sources.join(",");

  const loadMore = useCallback(async () => {
    const gen = generation.current;
    setLoading(true);
    const out: ActivityLog[] = [];
    let more = true;
    // Refill dry sources, merge, repeat — a source draining mid-merge would otherwise cut the page short.
    for (let round = 0; round < 10 && more && out.length < pageSize; round++) {
      await Promise.all(
        sources.map(async (source) => {
          const st = state.current.get(source)!;
          if (st.exhausted || st.buffer.length > 0) return;
          try {
            const page = await fetchActivityPage(source, scope, st.cursor, pageSize);
            st.buffer.push(...page.data);
            st.cursor = page.nextBefore ?? undefined;
            st.exhausted = page.nextBefore === null;
          } catch (err) {
            st.exhausted = true;
            st.error = apiErrorMessage(err, "lỗi không xác định");
          }
        }),
      );
      if (gen !== generation.current) return; // scope changed while fetching
      const step = mergeStep(
        sources.map((s) => state.current.get(s)!),
        pageSize - out.length,
        newer,
      );
      out.push(...step.out);
      more = step.hasMore;
    }

    setItems((prev) => [...prev, ...out]);
    setHasMore(more);
    setErrors(Object.fromEntries(sources.flatMap((s) => (state.current.get(s)!.error ? [[s, state.current.get(s)!.error!]] : []))));
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, pageSize]);

  useEffect(() => {
    generation.current++;
    state.current = new Map(sources.map((s) => [s, { buffer: [], exhausted: false }]));
    setItems([]);
    setErrors({});
    setHasMore(true);
    void loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  return { items, loading, hasMore, errors, loadMore };
}
