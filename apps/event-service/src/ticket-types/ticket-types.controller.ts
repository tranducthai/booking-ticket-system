import { Body, Controller, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentActor } from "../auth/current-actor.decorator";
import { RequireAuthGuard } from "../auth/require-auth.guard";
import { Role } from "../auth/role";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CreateTicketTypeDto } from "./dto/create-ticket-type.dto";
import { UpdateTicketTypeDto } from "./dto/update-ticket-type.dto";
import { TicketTypesService } from "./ticket-types.service";
import { LogActivity } from "../activity-log/log-activity.decorator";

@Controller()
@UseGuards(RequireAuthGuard, RolesGuard)
@Roles(Role.ORGANIZER, Role.ADMIN)
export class TicketTypesController {
  constructor(private readonly ticketTypesService: TicketTypesService) {}

  @Post("events/:eventId/ticket-types")
  @LogActivity({ action: "ticket_type.created", targetType: "ticket_type", summary: ({ result }) => `Tạo hạng vé "${result.name}" (${result.quantityTotal} vé)` })
  create(
    @Param("eventId") eventId: string,
    @CurrentActor() actor: { userId: string; role: Role },
    @Body() dto: CreateTicketTypeDto,
  ) {
    return this.ticketTypesService.create(eventId, actor, dto);
  }

  @Patch("ticket-types/:id")
  @LogActivity({ action: "ticket_type.updated", targetType: "ticket_type", bodyFields: true, summary: ({ result }) => `Cập nhật hạng vé "${result.name}"` })
  update(@Param("id") id: string, @CurrentActor() actor: { userId: string; role: Role }, @Body() dto: UpdateTicketTypeDto) {
    return this.ticketTypesService.update(id, actor, dto);
  }
}
