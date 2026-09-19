// k6 run infra/k6/waiting-room.js
//
// Exercises the waiting-room gate on a highDemand=true event: each VU joins
// the queue (POST .../waiting-room/join), polls status until admitted, then
// immediately hits the gated event-detail route to confirm admission
// actually lets it through. Reports time-to-admit and — the thing this
// script exists to catch — any VU admitted while the event still shows
// itself as sold out (event-service/src/waiting-room/waiting-room.service.ts's
// capacity-aware release() is what's supposed to prevent that; this is the
// load-test evidence for it docs/spec/12-resilience-and-failure-design.md
// §2.10 flagged as missing).
//
// Required env vars:
//   BASE_URL   gateway origin, default http://localhost:3000
//   EVENT_ID   a PUBLISHED event with highDemand=true (PATCH
//              /event/events/:id/high-demand as its organizer/an admin first)
//
// Each VU uses its own random queueSession (crypto-random per iteration is
// unnecessary — one join per VU for the run is the realistic shape, so the
// session is derived once from __VU + a run-unique seed).

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Counter } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const EVENT_ID = __ENV.EVENT_ID;
const RUN_SEED = `${Date.now()}`;

const admitLatency = new Trend("time_to_admit_ms");
const admittedIntoSoldOut = new Counter("admitted_into_sold_out"); // MUST stay 0
const joinRejected = new Counter("join_rejected"); // queue full — expected once past the capacity*multiplier cap, not a bug

export const options = {
  scenarios: {
    queue_rush: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "5s", target: 300 }, // everyone arrives at once, like the real T0 burst this is meant to absorb
        { duration: "50s", target: 300 },
        { duration: "5s", target: 0 },
      ],
    },
  },
  thresholds: {
    admitted_into_sold_out: ["count==0"],
  },
};

export default function () {
  if (!EVENT_ID) {
    throw new Error("Set EVENT_ID — see this file's header comment");
  }
  const sessionId = `k6-${RUN_SEED}-${__VU}`;
  const startedAt = Date.now();

  const joinRes = http.post(
    `${BASE_URL}/event/events/${EVENT_ID}/waiting-room/join`,
    JSON.stringify({ sessionId }),
    { headers: { "content-type": "application/json" } },
  );
  if (joinRes.status !== 200 && joinRes.status !== 201) {
    joinRejected.add(1);
    return;
  }
  let admitted = JSON.parse(joinRes.body).admitted === true;

  for (let i = 0; i < 60 && !admitted; i++) {
    sleep(1);
    const statusRes = http.get(`${BASE_URL}/event/events/${EVENT_ID}/waiting-room/status?sessionId=${sessionId}`);
    check(statusRes, { "status 200": (r) => r.status === 200 });
    admitted = JSON.parse(statusRes.body).admitted === true;
  }

  if (!admitted) return; // didn't get in within the poll budget — report via the trend's implicit long tail, not a hard failure

  admitLatency.add(Date.now() - startedAt);

  // Confirm admission actually opens the gate, and that we weren't let
  // through into an event with nothing left to buy.
  const detailRes = http.get(`${BASE_URL}/event/events/${EVENT_ID}`, {
    headers: { "x-queue-session": sessionId },
  });
  check(detailRes, { "admitted session reaches event detail": (r) => r.status === 200 });
  if (detailRes.status === 200) {
    const event = JSON.parse(detailRes.body);
    const soldOut =
      event.ticketMode === "GENERAL"
        ? (event.ticketTypes || []).every((tt) => tt.quantitySold >= tt.quantityTotal)
        : false; // seat-map sellout isn't visible on this payload; GENERAL is the common case this script targets
    if (soldOut) admittedIntoSoldOut.add(1);
  }
}
