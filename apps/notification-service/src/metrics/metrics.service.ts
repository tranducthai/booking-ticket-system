import { Injectable } from "@nestjs/common";
import * as client from "prom-client";

/**
 * See event-service/src/metrics/metrics.service.ts for the full rationale —
 * duplicated per service. Notification Service has no REST API of its own
 * (docs/spec/08-api-contracts.md §6), so httpRequest* only ever sees the
 * health check and this /metrics endpoint itself.
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

  readonly emailsSentTotal = new client.Counter({
    name: "emails_sent_total",
    help: "Emails sent successfully via SMTP",
    registers: [this.registry],
  });

  readonly emailsFailedTotal = new client.Counter({
    name: "emails_failed_total",
    help: "Emails that failed to send at the SMTP transport",
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
