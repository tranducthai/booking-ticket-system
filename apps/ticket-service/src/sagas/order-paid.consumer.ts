import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import {
  EventEnvelope,
  EXCHANGES,
  OrderPaidPayload,
  QrPayload,
  ROUTING_KEYS,
  TicketIssuedPayload,
} from "@booking-ticket-system/event-contracts";
import { MetricsService } from "../metrics/metrics.service";
import { PrismaService } from "../prisma/prisma.service";
import { QrSignerService } from "../qr/qr-signer.service";
import { RabbitMqService } from "../rabbitmq/rabbitmq.service";

/**
 * docs/spec/09-event-contracts.md catalog: OrderPaid -> Ticket Service
 * generates QR tickets, then republishes TicketIssued for Notification
 * Service. Idempotent both ways: the outer ProcessedEvent guard, and
 * `ticket.orderItemId` is @unique so a redelivered envelope's inserts are
 * caught even if the outer guard were somehow bypassed.
 */
@Injectable()
export class OrderPaidConsumer implements OnModuleInit {
  private readonly logger = new Logger(OrderPaidConsumer.name);

  constructor(
    private readonly rabbit: RabbitMqService,
    private readonly prisma: PrismaService,
    private readonly qrSigner: QrSignerService,
    private readonly metrics: MetricsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbit.consume<OrderPaidPayload>(
      EXCHANGES.BOOKING,
      "ticket-service.order-paid",
      ROUTING_KEYS.ORDER_PAID,
      (envelope) => this.onOrderPaid(envelope),
    );
  }

  private async onOrderPaid(envelope: EventEnvelope<OrderPaidPayload>): Promise<void> {
    try {
      await this.prisma.processedEvent.create({ data: { eventId: envelope.eventId, consumer: "order-paid" } });
    } catch {
      this.logger.log(`Duplicate delivery of order-paid eventId=${envelope.eventId} — skipping`);
      return;
    }

    const { orderId, userId, eventId, items } = envelope.payload;
    const issued: TicketIssuedPayload["tickets"] = [];

    for (const item of items) {
      const existing = await this.prisma.ticket.findUnique({ where: { orderItemId: item.orderItemId } });
      if (existing) {
        issued.push({ ticketId: existing.id, orderItemId: existing.orderItemId, qrPayload: existing.qrPayload });
        continue;
      }

      const payload: QrPayload = {
        ticketId: "", // filled in after we know the row's id — see below
        eventId,
        orderItemId: item.orderItemId,
        issuedAt: new Date().toISOString(),
      };
      // The ticketId is part of the signed payload but Prisma only assigns
      // the uuid on insert — generate it up front so the signature can
      // include it in one pass instead of a sign-then-update round trip.
      const ticketId = crypto.randomUUID();
      payload.ticketId = ticketId;
      const signed = this.qrSigner.sign(payload);

      const ticket = await this.prisma.ticket.create({
        data: {
          id: ticketId,
          orderItemId: item.orderItemId,
          eventId,
          userId,
          qrPayload: signed.qrPayload,
          qrSignature: signed.qrSignature,
        },
      });
      issued.push({ ticketId: ticket.id, orderItemId: ticket.orderItemId, qrPayload: ticket.qrPayload });
      this.metrics.ticketsIssuedTotal.inc();
    }

    const payload: TicketIssuedPayload = { orderId, userId, tickets: issued };
    await this.rabbit.publish(EXCHANGES.TICKET, ROUTING_KEYS.TICKET_ISSUED, payload);
  }
}
