import { Controller, Get } from "@nestjs/common";

/**
 * Backs the Docker healthcheck in docs/spec/swarm/docker-stack.yml (/health/live).
 * Swarm has one healthcheck, not separate liveness/readiness probes.
 * /health/ready can later check DB/Redis/broker connectivity; /health/live must
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
