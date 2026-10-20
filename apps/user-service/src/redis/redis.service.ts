import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

/**
 * Same shape as apps/event-service/src/redis/redis.service.ts. user-service
 * only uses it as the session allow-list api-gateway reads on every request
 * (src/sessions/session-keys.ts) — Postgres stays the source of truth.
 */
@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  constructor(config: ConfigService) {
    super(config.get<string>("REDIS_URL") ?? "redis://localhost:6379", {
      // Fail a login/logout fast instead of hanging it while Redis is down.
      maxRetriesPerRequest: 2,
      commandTimeout: 3000,
    });
  }

  async onModuleDestroy() {
    this.disconnect();
  }
}
