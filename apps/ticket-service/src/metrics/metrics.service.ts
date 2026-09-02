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

  readonly ticketsIssuedTotal = new client.Counter({
    name: "tickets_issued_total",
    help: "QR tickets issued after OrderPaid",
    registers: [this.registry],
  });

  readonly checkinsTotal = new client.Counter({
    name: "checkins_total",
    help: "Successful ticket check-ins at the gate",
    registers: [this.registry],
  });

  readonly checkinRejectedTotal = new client.Counter({
    name: "checkin_rejected_total",
    help: "Rejected check-in attempts, labeled by reason",
    labelNames: ["reason"], // "invalid_signature" | "already_used" | "canceled" | "not_found"
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
