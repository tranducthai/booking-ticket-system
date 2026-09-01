import { Body, Controller, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentActor } from "../auth/current-actor.decorator";
import { RequireAuthGuard } from "../auth/require-auth.guard";
import { Role } from "../auth/role";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CreateTicketTypeDto } from "./dto/create-ticket-type.dto";
import { UpdateTicketTypeDto } from "./dto/update-ticket-type.dto";
import { TicketTypesService } from "./ticket-types.service";

@Controller()
@UseGuards(RequireAuthGuard, RolesGuard)
@Roles(Role.ORGANIZER)
export class TicketTypesController {
  constructor(private readonly ticketTypesService: TicketTypesService) {}

  @Post("events/:eventId/ticket-types")
  create(
    @Param("eventId") eventId: string,
    @CurrentActor() actor: { userId: string },
    @Body() dto: CreateTicketTypeDto,
  ) {
    return this.ticketTypesService.create(eventId, actor.userId, dto);
  }

  @Patch("ticket-types/:id")
  update(@Param("id") id: string, @CurrentActor() actor: { userId: string }, @Body() dto: UpdateTicketTypeDto) {
    return this.ticketTypesService.update(id, actor.userId, dto);
  }
}
