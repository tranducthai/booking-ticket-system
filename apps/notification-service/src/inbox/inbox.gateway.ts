import { Injectable, Logger } from "@nestjs/common";
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import * as jwt from "jsonwebtoken";
import { Server, Socket } from "socket.io";

interface AccessTokenPayload {
  sub: string;
  role: string;
}

function roomFor(userId: string): string {
  return `user:${userId}`;
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
 * `jsonwebtoken`, JWT_ACCESS_SECRET, `{sub, role}` payload).
 */
@Injectable()
@WebSocketGateway({ namespace: "/notifications", cors: { origin: "*" } })
export class NotificationsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(NotificationsGateway.name);
  private readonly accessSecret = process.env.JWT_ACCESS_SECRET ?? "";

  @WebSocketServer() server!: Server;

  handleConnection(client: Socket): void {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      client.disconnect(true);
      return;
    }
    try {
      const payload = jwt.verify(token, this.accessSecret) as AccessTokenPayload;
      client.join(roomFor(payload.sub));
    } catch {
      this.logger.warn(`Rejected socket connection: invalid or expired token`);
      client.disconnect(true);
    }
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
