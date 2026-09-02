import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { TicketStatus } from "../generated/prisma";
import { Actor } from "../auth/current-actor.decorator";
import { Role } from "../auth/role";
import { EventServiceClient } from "../event-client/event-service.client";
import { MetricsService } from "../metrics/metrics.service";
import { PrismaService } from "../prisma/prisma.service";
import { QrSignerService } from "../qr/qr-signer.service";
import { ListMineDto } from "./dto/list-mine.dto";

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qrSigner: QrSignerService,
    private readonly eventClient: EventServiceClient,
    private readonly metrics: MetricsService,
  ) {}

  async listMine(userId: string, query: ListMineDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [data, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.ticket.count({ where: { userId } }),
    ]);
    return { data, page, limit, total };
  }

  async findOwned(ticketId: string, userId: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) {
      throw new NotFoundException("Ticket not found");
    }
    if (ticket.userId !== userId) {
      throw new ForbiddenException("You do not own this ticket");
    }
    return ticket;
  }

  /**
   * UC-02 (docs/spec/02-use-cases.md). Two-phase validation per
   * docs/spec/09-event-contracts.md "QR payload": signature first (instant,
   * offline-safe, catches tampered/forged codes), THEN the DB status check
   * (catches replay — a second scan of the same, validly-signed ticket).
   */
  async checkIn(ticketId: string, qrPayload: string, staffUserId: string) {
    const decoded = this.qrSigner.verify(qrPayload);
    if (!decoded) {
      this.metrics.checkinRejectedTotal.inc({ reason: "invalid_signature" });
      throw new BadRequestException("Invalid or tampered QR code");
    }
    if (decoded.ticketId !== ticketId) {
      this.metrics.checkinRejectedTotal.inc({ reason: "invalid_signature" });
      throw new BadRequestException("QR code does not match this ticket");
    }

    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket || ticket.qrPayload !== qrPayload) {
      this.metrics.checkinRejectedTotal.inc({ reason: "not_found" });
      throw new BadRequestException("Ticket not found for this QR code");
    }
    if (ticket.status === TicketStatus.USED) {
      this.metrics.checkinRejectedTotal.inc({ reason: "already_used" });
      throw new ConflictException("This ticket was already checked in");
    }
    if (ticket.status === TicketStatus.CANCELED) {
      this.metrics.checkinRejectedTotal.inc({ reason: "canceled" });
      throw new BadRequestException("This ticket has been canceled");
    }

    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { status: TicketStatus.USED, checkedInAt: new Date(), checkedInBy: staffUserId },
    });
    this.metrics.checkinsTotal.inc();
    return updated;
  }

  async attendees(eventId: string, actor: Actor) {
    if (actor.role !== Role.ADMIN) {
      const organizerId = await this.eventClient.getOrganizerId(eventId);
      if (organizerId !== actor.userId) {
        throw new ForbiddenException("You do not own this event");
      }
    }
    return this.prisma.ticket.findMany({ where: { eventId }, orderBy: { createdAt: "asc" } });
  }
}
