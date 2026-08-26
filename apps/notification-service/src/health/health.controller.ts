import { Controller, Get } from "@nestjs/common";

/**
 * Backs the k8s startup/liveness/readiness probes defined in
 * docs/spec/k8s/deployment.yaml — /health/live and /health/ready.
 * Readiness can later check DB/Redis/broker connectivity; liveness must
 * stay dependency-free so it never reports unhealthy for a downstream outage.
 */
@Controller("health")
export class HealthController {
  @Get("live")
  live() {
    return { status: "ok" };
  }

  @Get("ready")
  ready() {
    return { status: "ok" };
  }
}
