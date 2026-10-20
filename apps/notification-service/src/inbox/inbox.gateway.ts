import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { OnGatewayConnection, OnGatewayInit, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import Redis from "ioredis";
import * as jwt from "jsonwebtoken";
import { Server, Socket } from "socket.io";

interface AccessTokenPayload {
  sub: string;
  role: string;
  sid: string;
}

function roomFor(userId: string): string {
  return `user:${userId}`;
}

function sessionRoom(sid: string): string {
  return `session:${sid}`;
}

// Same layout as apps/user-service/src/sessions/session-keys.ts (the only writer) — keep in sync.
const sessionKey = (sid: string) => `auth:session:${sid}`;
const SESSION_REVOKED_CHANNEL = "auth:session-revoked";

/**
 * Read at import time, i.e. from the real process environment (set by the
 * host in any deployment) — ConfigModule's .env loading hasn't run yet when
 * decorators evaluate, so local dev without the var falls back to "*".
 */
function socketCorsOrigin(): string | string[] {
  const origins = (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return origins.length === 0 || origins.includes("*") ? "*" : origins;
}

/**
 * Unlike every other inter-service call in this codebase, this gateway
 * isn't reached through api-gateway — it doesn't proxy WebSocket upgrades
 * (see apps/api-gateway/src/proxy/routes.ts), so the browser connects here
 * directly, the same way apps/event-service's SeatMapGateway is reached
 * directly. That means the trusted X-User-Id header the rest of this
 * service relies on (auth/current-actor.decorator.ts) doesn't exist for a
 * socket connection — this is the one place that verifies the JWT itself,
 * mirroring api-gateway's jwt-context.middleware.ts exactly (raw
 * `jsonwebtoken`, JWT_ACCESS_SECRET, `{sub, role, sid}` payload) — including
 * the session check: the token's session must still be active in Redis, and
 * when user-service revokes it (logout, a login on another device, account
 * lock) it PUBLISHes the sid, so that session's open sockets are dropped
 * right away instead of keeping on receiving the user's notifications.
 */
@Injectable()
@WebSocketGateway({ namespace: "/notifications", cors: { origin: socketCorsOrigin() } })
export class NotificationsGateway implements OnGatewayInit, OnGatewayConnection, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsGateway.name);
  private readonly accessSecret = process.env.JWT_ACCESS_SECRET ?? "";
  private redis?: Redis;
  private subscriber?: Redis;

  @WebSocketServer() server!: Server;

  afterInit(): void {
    const url = process.env.REDIS_URL ?? "redis://localhost:6379";
    this.redis = new Redis(url, { maxRetriesPerRequest: 1, commandTimeout: 2000 });
    this.subscriber = new Redis(url);
    for (const conn of [this.redis, this.subscriber]) conn.on("error", (err) => this.logger.warn(`Redis: ${err.message}`));
    this.subscriber.subscribe(SESSION_REVOKED_CHANNEL).catch((err: Error) => this.logger.error(`Could not subscribe: ${err.message}`));
    this.subscriber.on("message", (_channel: string, sid: string) => {
      this.server.in(sessionRoom(sid)).disconnectSockets(true);
    });
  }

  onModuleDestroy(): void {
    this.redis?.disconnect();
    this.subscriber?.disconnect();
  }

  async handleConnection(client: Socket): Promise<void> {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      client.disconnect(true);
      return;
    }
    let payload: AccessTokenPayload;
    try {
      payload = jwt.verify(token, this.accessSecret, { algorithms: ["HS256"] }) as AccessTokenPayload;
      if (typeof payload.sid !== "string") throw new Error("no session id");
    } catch {
      this.logger.warn(`Rejected socket connection: invalid or expired token`);
      client.disconnect(true);
      return;
    }
    try {
      if ((await this.redis?.get(sessionKey(payload.sid))) !== "active") {
        client.disconnect(true);
        return;
      }
    } catch (err) {
      this.logger.warn(`Rejected socket connection: session store unreachable (${(err as Error).message})`);
      client.disconnect(true);
      return;
    }
    client.join([roomFor(payload.sub), sessionRoom(payload.sid)]);
  }

  /**
   * Called by InboxService right after persisting a notification. A no-op
   * if the recipient isn't connected right now — they'll see it next time
   * they fetch their inbox over REST. Rooms are in-memory (no Redis
   * adapter), so this only reaches clients connected to THIS instance —
   * see infra/swarm/docker-stack.yml's note on why notification-service
   * stays at replicas: 1.
   */
  push(userId: string, notification: unknown): void {
    this.server.to(roomFor(userId)).emit("notification", notification);
  }
}
