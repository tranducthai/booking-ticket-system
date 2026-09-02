import { Injectable } from "@nestjs/common";
import * as client from "prom-client";

/**
 * See event-service/src/metrics/metrics.service.ts for the full rationale —
 * duplicated per service. user-service has no queue consumers and no
 * saga-shaped business events worth a dedicated counter, so this is generic
 * HTTP metrics only (still enough for RED-method dashboards/alerts).
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

  constructor() {
    client.collectDefaultMetrics({ register: this.registry });
  }
}
