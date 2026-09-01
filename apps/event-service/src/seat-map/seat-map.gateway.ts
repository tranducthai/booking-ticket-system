import { Injectable } from "@nestjs/common";
import { SubscribeMessage, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import { Server, Socket } from "socket.io";

function roomName(eventId: string) {
  return `event:${eventId}`;
}

/**
 * Realtime seat-map updates (docs/spec/01-business-analysis.md §5: "consider
 * WebSocket to push seat state directly"). Clients join a room per event;
 * HoldsService calls broadcastSeatUpdate() after every hold/release/confirm
 * so everyone viewing the same seat map sees the color change immediately.
 */
@Injectable()
@WebSocketGateway({ namespace: "/seat-map", cors: { origin: "*" } })
export class SeatMapGateway {
  @WebSocketServer()
  server!: Server;

  @SubscribeMessage("subscribe")
  handleSubscribe(client: Socket, eventId: string): void {
    client.join(roomName(eventId));
  }

  @SubscribeMessage("unsubscribe")
  handleUnsubscribe(client: Socket, eventId: string): void {
    client.leave(roomName(eventId));
  }

  broadcastSeatUpdate(eventId: string, seat: { id: string; status: string }): void {
    this.server.to(roomName(eventId)).emit("seat:update", seat);
  }
}
