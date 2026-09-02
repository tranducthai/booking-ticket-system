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

  readonly paymentsSucceededTotal = new client.Counter({
    name: "payments_succeeded_total",
    help: "Payments that completed successfully via the gateway webhook",
    labelNames: ["gateway"],
    registers: [this.registry],
  });

  readonly paymentsFailedTotal = new client.Counter({
    name: "payments_failed_total",
    help: "Payments that failed at the gateway",
    labelNames: ["gateway"],
    registers: [this.registry],
  });

  readonly refundsCompletedTotal = new client.Counter({
    name: "refunds_completed_total",
    help: "Refunds (manual or auto) completed",
    labelNames: ["kind"], // "manual" | "auto"
    registers: [this.registry],
  });

  readonly reconciliationMismatchesTotal = new client.Counter({
    name: "reconciliation_mismatches_total",
    help: "Payments the reconciliation job found stuck PENDING past its threshold",
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
