import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentActor } from "../auth/current-actor.decorator";
import { RequireAuthGuard } from "../auth/require-auth.guard";
import { Role } from "../auth/role";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CreateEventDto } from "./dto/create-event.dto";
import { RejectEventDto } from "./dto/reject-event.dto";
import { SearchEventsDto } from "./dto/search-events.dto";
import { UpdateEventDto } from "./dto/update-event.dto";
import { EventsService } from "./events.service";

@Controller("events")
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  search(@Query() query: SearchEventsDto) {
    return this.eventsService.search(query);
  }

  /** Must be registered before ":id" — same reason as "mine" below. */
  @Get("pending")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  findPending(@Query("page") page?: string, @Query("limit") limit?: string) {
    return this.eventsService.findPendingApproval(Number(page) || 1, Number(limit) || 20);
  }

  /** Must be registered before ":id" or Express would try to parse "mine" as an event id. */
  @Get("mine")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER)
  findMine(
    @CurrentActor() actor: { userId: string },
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.eventsService.findMineByOrganizer(actor.userId, Number(page) || 1, Number(limit) || 20);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.eventsService.findById(id);
  }

  @Post()
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER)
  create(@CurrentActor() actor: { userId: string }, @Body() dto: CreateEventDto) {
    return this.eventsService.create(actor.userId, dto);
  }

  @Patch(":id")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER)
  update(@Param("id") id: string, @CurrentActor() actor: { userId: string }, @Body() dto: UpdateEventDto) {
    return this.eventsService.update(id, actor.userId, dto);
  }

  @Post(":id/submit")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER)
  submit(@Param("id") id: string, @CurrentActor() actor: { userId: string }) {
    return this.eventsService.submit(id, actor.userId);
  }

  @Patch(":id/approve")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  approve(@Param("id") id: string) {
    return this.eventsService.approve(id);
  }

  @Patch(":id/reject")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  reject(@Param("id") id: string, @Body() dto: RejectEventDto) {
    return this.eventsService.reject(id, dto);
  }
}
