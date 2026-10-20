import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EventEnvelope } from "@booking-ticket-system/event-contracts";
import * as amqp from "amqplib";
import { randomUUID } from "crypto";

/**
 * Publish-only amqplib wrapper (docs/spec/09-event-contracts.md convention;
 * duplicated per service on purpose — see booking-service's copy). Unlike
 * the other services' copies, a broker that's down at boot does NOT fail
 * startup: login/register must keep working without RabbitMQ — only the
 * password-reset email depends on it, and it reconnects lazily on publish.
 */
@Injectable()
export class RabbitMqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqService.name);
  private connection?: amqp.ChannelModel;
  private channel?: amqp.Channel;
  private connecting?: Promise<amqp.Channel>;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.getChannel().catch((err) =>
      this.logger.warn(`RabbitMQ not reachable at boot (${(err as Error).message}) — will retry on publish`),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }

  private getChannel(): Promise<amqp.Channel> {
    if (this.channel) return Promise.resolve(this.channel);
    this.connecting ??= (async () => {
      const url = this.config.get<string>("RABBITMQ_URL") ?? "amqp://guest:guest@localhost:5672";
      const connection = await amqp.connect(url);
      connection.on("error", (err) => this.logger.error(`RabbitMQ connection error: ${err.message}`));
      connection.on("close", () => {
        this.channel = undefined;
        this.connection = undefined;
      });
      this.connection = connection;
      this.channel = await connection.createChannel();
      return this.channel;
    })().finally(() => {
      this.connecting = undefined;
    });
    return this.connecting;
  }

  async publish<T>(exchange: string, routingKey: string, payload: T): Promise<void> {
    const channel = await this.getChannel();
    await channel.assertExchange(exchange, "topic", { durable: true });
    const envelope: EventEnvelope<T> = {
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      payload,
    };
    channel.publish(exchange, routingKey, Buffer.from(JSON.stringify(envelope)), {
      persistent: true,
      contentType: "application/json",
    });
    this.logger.log(`Published ${exchange}/${routingKey} eventId=${envelope.eventId}`);
  }
}
