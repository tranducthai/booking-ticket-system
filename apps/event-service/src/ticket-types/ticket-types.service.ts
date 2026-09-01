import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateTicketTypeDto } from "./dto/create-ticket-type.dto";
import { UpdateTicketTypeDto } from "./dto/update-ticket-type.dto";

@Injectable()
export class TicketTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(eventId: string, organizerId: string, dto: CreateTicketTypeDto) {
    await this.assertEventOwner(eventId, organizerId);
    return this.prisma.ticketType.create({ data: { ...dto, eventId } });
  }

  async update(id: string, organizerId: string, dto: UpdateTicketTypeDto) {
    const ticketType = await this.prisma.ticketType.findUnique({ where: { id } });
    if (!ticketType) {
      throw new NotFoundException("Ticket type not found");
    }
    await this.assertEventOwner(ticketType.eventId, organizerId);
    return this.prisma.ticketType.update({ where: { id }, data: dto });
  }

  private async assertEventOwner(eventId: string, organizerId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException("Event not found");
    }
    if (event.organizerId !== organizerId) {
      throw new ForbiddenException("You do not own this event");
    }
    return event;
  }
}
