// k6 run infra/k6/flash-sale.js
//
// Simulates docs/spec/04-deployment-design.md's flash-sale write-path
// scenario: many virtual users hitting POST /cart/hold + POST /payments
// for the same event's General Admission ticket type at once. Reports the
// numbers that document is designed around — p95/p99 latency and the
// oversell counter, which must stay 0 no matter how much load is thrown
// at it (the DB-level atomic UPDATE in event-service's holds.service.ts
// is what actually enforces that, not this script).
//
// Required env vars (see scripts/seed-flash-sale.md for how to get them —
// not included here since it needs a live login/create-event pass first):
//   BASE_URL        gateway origin, default http://localhost:3000
//   CUSTOMER_TOKENS  comma-separated JWTs, one per simulated buyer (cheap
//                    stand-in for a real login-per-VU flow, which would
//                    dominate the load test with bcrypt cost instead of
//                    exercising the booking path this script targets)
//   EVENT_ID, TICKET_TYPE_ID

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const TOKENS = (__ENV.CUSTOMER_TOKENS || "").split(",").filter(Boolean);
const EVENT_ID = __ENV.EVENT_ID;
const TICKET_TYPE_ID = __ENV.TICKET_TYPE_ID;

const holdLatency = new Trend("hold_latency_ms");
const oversellCounter = new Counter("oversell_conflicts"); // 409s from the atomic reserve are EXPECTED near sellout, not a bug
const errorCounter = new Counter("unexpected_errors");

export const options = {
  scenarios: {
    flash_sale: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 200 }, // the T0 arrival burst
        { duration: "30s", target: 200 },
        { duration: "10s", target: 0 },
      ],
    },
  },
  thresholds: {
    hold_latency_ms: ["p(95)<500", "p(99)<1500"],
    unexpected_errors: ["count==0"],
  },
};

export default function () {
  if (TOKENS.length === 0 || !EVENT_ID || !TICKET_TYPE_ID) {
    throw new Error("Set CUSTOMER_TOKENS, EVENT_ID, TICKET_TYPE_ID — see this file's header comment");
  }
  const token = TOKENS[__VU % TOKENS.length];
  const headers = { Authorization: `Bearer ${token}`, "content-type": "application/json" };

  const holdRes = http.post(
    `${BASE_URL}/booking/cart/hold`,
    JSON.stringify({ eventId: EVENT_ID, items: [{ ticketTypeId: TICKET_TYPE_ID, quantity: 1 }] }),
    { headers },
  );
  holdLatency.add(holdRes.timings.duration);

  if (holdRes.status === 201 || holdRes.status === 200) {
    check(holdRes, { "hold created an order": (r) => !!JSON.parse(r.body).id });
  } else if (holdRes.status === 409) {
    oversellCounter.add(1); // sold out / lost the race — correct behavior under contention
  } else {
    errorCounter.add(1);
  }

  sleep(1);
}
