import { Injectable } from "@nestjs/common";
import * as client from "prom-client";

/** See event-service/src/metrics/metrics.service.ts for the full rationale — duplicated per service. */
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

  readonly ordersCreatedTotal = new client.Counter({
    name: "orders_created_total",
    help: "Orders created via POST /cart/hold",
    registers: [this.registry],
  });

  readonly ordersPaidTotal = new client.Counter({
    name: "orders_paid_total",
    help: "Orders that reached PAID",
    registers: [this.registry],
  });

  readonly ordersExpiredTotal = new client.Counter({
    name: "orders_expired_total",
    help: "Orders swept as expired (abandoned or PaymentFailed) — labeled by source",
    labelNames: ["source"],
    registers: [this.registry],
  });

  /** hold-created -> PAID, in seconds — the "hold->paid conversion" latency docs/spec/12-resilience-and-failure-design.md's dashboard section wants. */
  readonly holdToPaidSeconds = new client.Histogram({
    name: "hold_to_paid_seconds",
    help: "Time from Order creation to PAID",
    buckets: [5, 15, 30, 60, 120, 300, 600],
    registers: [this.registry],
  });

  readonly autoRefundsTotal = new client.Counter({
    name: "auto_refunds_triggered_total",
    help: "Compensating auto-refunds triggered after a lost hold at confirm",
    registers: [this.registry],
  });

  readonly dlqMessagesTotal = new client.Counter({
    name: "dlq_messages_total",
    help: "Messages routed to a dead-letter queue",
    labelNames: ["queue"],
    registers: [this.registry],
  });

  constructor() {
    client.collectDefaultMetrics({ register: this.registry });
  }
}
