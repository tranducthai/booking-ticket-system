import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EventEnvelope } from "@booking-ticket-system/event-contracts";
import * as amqp from "amqplib";
import { randomUUID } from "crypto";
import { MetricsService } from "../metrics/metrics.service";

/**
 * Thin wrapper around amqplib implementing the convention in
 * docs/spec/09-event-contracts.md: 1 topic exchange per publishing service,
 * routing key = event name, queue = "<consumer-service>.<event-name>", every
 * message wrapped in an EventEnvelope so consumers can de-duplicate on
 * redelivery. Publishing NestJS services duplicate this file on purpose —
 * see docs/spec/05-project-structure-and-tech-stack.md "one shared library
 * worth having" (event-contracts' *types*, not this transport glue).
 */
@Injectable()
export class RabbitMqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqService.name);
  private connection?: amqp.ChannelModel;
  private channel?: amqp.Channel;

  constructor(
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>("RABBITMQ_URL") ?? "amqp://guest:guest@localhost:5672";
    this.connection = await amqp.connect(url);
    this.channel = await this.connection.createChannel();
    await this.channel.prefetch(10);
    this.connection.on("error", (err) => this.logger.error(`RabbitMQ connection error: ${err.message}`));
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }

  private requireChannel(): amqp.Channel {
    if (!this.channel) {
      throw new Error("RabbitMQ channel is not ready yet");
    }
    return this.channel;
  }

  async publish<T>(exchange: string, routingKey: string, payload: T): Promise<void> {
    const channel = this.requireChannel();
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

  /**
   * Binds `queue` to `exchange`/`routingKey` and wires a matching
   * `<queue>.dlq` (via a per-exchange dead-letter exchange) for whatever the
   * handler rejects — see docs/spec/12-resilience-and-failure-design.md.
   * The handler itself owns idempotency (a ProcessedEvent row keyed on
   * envelope.eventId) since RabbitMQ only guarantees at-least-once delivery.
   */
  async consume<T>(
    exchange: string,
    queue: string,
    routingKey: string,
    handler: (envelope: EventEnvelope<T>) => Promise<void>,
  ): Promise<void> {
    const channel = this.requireChannel();
    const dlx = `${exchange}.dlx`;
    const dlq = `${queue}.dlq`;

    await channel.assertExchange(exchange, "topic", { durable: true });
    await channel.assertExchange(dlx, "topic", { durable: true });
    await channel.assertQueue(dlq, { durable: true });
    await channel.bindQueue(dlq, dlx, routingKey);

    await channel.assertQueue(queue, {
      durable: true,
      deadLetterExchange: dlx,
      deadLetterRoutingKey: routingKey,
    });
    await channel.bindQueue(queue, exchange, routingKey);

    await channel.consume(queue, (msg) => {
      if (!msg) return;
      void (async () => {
        try {
          const envelope = JSON.parse(msg.content.toString()) as EventEnvelope<T>;
          await handler(envelope);
          channel.ack(msg);
        } catch (err) {
          this.logger.error(
            `Handler failed for queue=${queue}: ${(err as Error).message} — routing to ${dlq}`,
          );
          this.metrics.dlqMessagesTotal.inc({ queue: dlq });
          channel.nack(msg, false, false);
        }
      })();
    });
    this.logger.log(`Consuming ${queue} <- ${exchange}/${routingKey} (dlq=${dlq})`);
  }
}
