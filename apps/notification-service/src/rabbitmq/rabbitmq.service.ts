import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EventEnvelope } from "@booking-ticket-system/event-contracts";
import * as amqp from "amqplib";

/**
 * Notification Service only ever consumes (docs/spec/08-api-contracts.md §6
 * "no REST API — pure broker consumer"), so this is a trimmed-down copy of
 * the other services' rabbitmq.service.ts without a publish() method.
 */
@Injectable()
export class RabbitMqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqService.name);
  private connection?: amqp.ChannelModel;
  private channel?: amqp.Channel;

  constructor(private readonly config: ConfigService) {}

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

  async consume<T>(
    exchange: string,
    queue: string,
    routingKey: string,
    handler: (envelope: EventEnvelope<T>) => Promise<void>,
  ): Promise<void> {
    if (!this.channel) {
      throw new Error("RabbitMQ channel is not ready yet");
    }
    const channel = this.channel;
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
          channel.nack(msg, false, false);
        }
      })();
    });
    this.logger.log(`Consuming ${queue} <- ${exchange}/${routingKey} (dlq=${dlq})`);
  }
}
