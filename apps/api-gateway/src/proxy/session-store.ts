import Redis from "ioredis";

/**
 * Same layout as apps/user-service/src/sessions/session-keys.ts (the only
 * writer) — keep in sync:
 *   auth:session:<sid> = "active" | "revoked:<reason>" | (missing = expired)
 */
const sessionKey = (sid: string) => `auth:session:${sid}`;

export type SessionStatus = { active: true } | { active: false; reason?: string };

export interface SessionChecker {
  /** Throws when the store itself can't be reached — the caller fails closed. */
  status(sid: string): Promise<SessionStatus>;
}

/**
 * The gateway's one piece of shared state: the session allow-list that makes
 * logout / single-session / account lock effective immediately rather than
 * when an access token expires. One GET per authenticated request.
 */
export class RedisSessionStore implements SessionChecker {
  private readonly redis: Redis;

  constructor(url: string) {
    this.redis = new Redis(url, { maxRetriesPerRequest: 1, commandTimeout: 2000 });
    // ioredis retries the connection by itself; without a listener an outage would also print an unhandled-error trace per attempt.
    this.redis.on("error", (err) => console.warn(`[api-gateway] Redis: ${err.message}`));
  }

  async status(sid: string): Promise<SessionStatus> {
    const value = await this.redis.get(sessionKey(sid));
    if (value === "active") return { active: true };
    return { active: false, reason: value?.startsWith("revoked:") ? value.slice("revoked:".length) : undefined };
  }

  disconnect(): void {
    this.redis.disconnect();
  }
}
