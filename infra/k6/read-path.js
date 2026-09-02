// k6 run infra/k6/read-path.js
//
// docs/spec/04-deployment-design.md §2a's read-path scenario: event detail
// + seat-map state polling, the ~6,000 req/s burst that dwarfs the write
// path at T0. NOTE: this repo hasn't built the Phase 8b cache layer yet
// (Redis read-through on event-service, the split getSeatMapLayout/
// getSeatMapState) — running this against the current code measures the
// UNCACHED baseline, which is the "before" number Phase 8b's own commit
// checkpoint (cache hit ratio, origin Postgres req/s) is meant to compare
// against, not a passing/failing target on its own yet.

import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const EVENT_ID = __ENV.EVENT_ID;

export const options = {
  scenarios: {
    read_burst: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 500 },
        { duration: "30s", target: 500 },
        { duration: "10s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<300"],
    http_req_failed: ["rate<0.01"],
  },
};

export default function () {
  if (!EVENT_ID) throw new Error("Set EVENT_ID");

  const detail = http.get(`${BASE_URL}/event/events/${EVENT_ID}`);
  check(detail, { "event detail 200": (r) => r.status === 200 });

  // Layout is fetched once per session in the real app (long TTL cache);
  // state is what actually gets polled every 2-3s, so it dominates load —
  // included here too but weighted toward being hit far more often would
  // need a two-scenario k6 setup, not done here for simplicity.
  const layout = http.get(`${BASE_URL}/event/events/${EVENT_ID}/seat-map/layout`);
  check(layout, { "seat map layout 200 or 404 (GA event)": (r) => r.status === 200 || r.status === 404 });

  const state = http.get(`${BASE_URL}/event/events/${EVENT_ID}/seat-map/state`);
  check(state, { "seat map state 200 or 404 (GA event)": (r) => r.status === 200 || r.status === 404 });

  sleep(2); // mirrors apps/web's poll interval (EventDetailPage.tsx refetchInterval)
}
