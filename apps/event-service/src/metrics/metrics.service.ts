import { Injectable } from "@nestjs/common";
import * as client from "prom-client";

/**
 * docs/spec/12-resilience-and-failure-design.md "Observability" —
 * Prometheus `/metrics` per service. Real prom-client counters/histograms,
 * not a stub: HTTP metrics come from MetricsInterceptor (every request,
 * automatic); the business counters below are incremented by hand at the
 * specific call sites that matter for THIS service (see each counter's
 * comment for where). No Prometheus server ships with this project by
 * default — infra/docker-compose.prometheus.yml (optional) scrapes these
 * if you want to actually run one; the endpoint works standalone either way
 * (`curl localhost:3002/metrics`).
 */
@Injectable()
export class MetricsService {
  readonly registry = new client.Registry();

  readonly httpRequestDuration = new client.Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["method", "route", "status"],
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
    registers: [this.registry],
  });

  readonly httpRequestsTotal = new client.Counter({
    name: "http_requests_total",
    help: "Total HTTP requests",
    labelNames: ["method", "route", "status"],
    registers: [this.registry],
  });

  /** Incremented in holds.service.ts holdSeat/holdSeatsBatch on a ConflictException — expected under flash-sale contention, not itself a bug. */
  readonly seatHoldConflictsTotal = new client.Counter({
    name: "seat_hold_conflicts_total",
    help: "Seat hold attempts that lost the race for an already-held/booked seat",
    registers: [this.registry],
  });

  /**
   * Must stay 0 — docs/spec/12-resilience-and-failure-design.md
   * "oversell counter (== 0)". Incremented only by the defense-in-depth
   * check in holds.service.ts confirmSeat (a seat found already BOOKED at
   * the moment of confirming it), which the Redis Lua ownership check
   * should make unreachable in practice.
   */
  readonly oversellTotal = new client.Counter({
    name: "oversell_total",
    help: "Seats confirmed BOOKED while already BOOKED — should never increment",
    registers: [this.registry],
  });

  /** Incremented by rabbitmq.service.ts on every nack (a message routed to a *.dlq). */
  readonly dlqMessagesTotal = new client.Counter({
    name: "dlq_messages_total",
    help: "Messages routed to a dead-letter queue",
    labelNames: ["queue"],
    registers: [this.registry],
  });

  constructor() {
    client.collectDefaultMetrics({ register: this.registry }); // process/event-loop metrics (memory, GC, etc.) for free
  }
}
