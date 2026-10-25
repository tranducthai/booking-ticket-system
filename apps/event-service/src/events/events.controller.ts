import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { CurrentActor } from "../auth/current-actor.decorator";
import { RequireAuthGuard } from "../auth/require-auth.guard";
import { Role } from "../auth/role";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { WaitingRoomGuard } from "../waiting-room/waiting-room.guard";
import { CreateEventDto } from "./dto/create-event.dto";
import { CancelEventDto, PostponeEventDto, RejectCancelRequestDto, RequestCancelEventDto } from "./dto/event-lifecycle.dto";
import { RejectEventDto } from "./dto/reject-event.dto";
import { SearchEventsDto } from "./dto/search-events.dto";
import { SetHighDemandDto } from "./dto/set-high-demand.dto";
import { SetLateSalesDto } from "./dto/set-late-sales.dto";
import { UpdateEventDto } from "./dto/update-event.dto";
import { EventPrivateInfoDto } from "./dto/event-private-info.dto";
import { AdminListEventsDto } from "./dto/admin-list-events.dto";
import { BadRequestException } from "@nestjs/common";
import { EventsService } from "./events.service";
import { FavoritesService } from "./favorites.service";
import { LogActivity } from "../activity-log/log-activity.decorator";

@Controller("events")
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly favoritesService: FavoritesService,
  ) {}

  @Get()
  search(@Query() query: SearchEventsDto) {
    return this.eventsService.search(query);
  }

  /** Must be registered before ":id" — admin console: every event, any status, with sales totals. */
  @Get("admin")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  findAllForAdmin(@Query() query: AdminListEventsDto) {
    return this.eventsService.findAllForAdmin(query);
  }

  /** Must be registered before ":id" — same reason as "mine" below. */
  @Get("pending")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  findPending(@Query("page") page?: string, @Query("limit") limit?: string) {
    return this.eventsService.findPendingApproval(Number(page) || 1, Number(limit) || 20);
  }

  /** Must be registered before ":id" — admin queue of organizer cancellation requests (docs/spec/13-refund-and-anti-fraud-design.md §2.3). */
  @Get("cancel-requests")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  findCancelRequests(@Query("page") page?: string, @Query("limit") limit?: string) {
    return this.eventsService.findCancelRequests(Number(page) || 1, Number(limit) || 20);
  }

  /** Public, before ":id" — events whose organizer reopened unsold tickets after the deadline ("Bán lại vé" page). */
  @Get("late-sales")
  findLateSales() {
    return this.eventsService.findLateSales();
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

  /** Must be registered before ":id" — same reason as "mine"/"pending" above. */
  @Get("favorites/mine")
  @UseGuards(RequireAuthGuard)
  findMyFavorites(@CurrentActor() actor: { userId: string }, @Query("page") page?: string, @Query("limit") limit?: string) {
    return this.favoritesService.listMine(actor.userId, Number(page) || 1, Number(limit) || 20);
  }

  /** Bulk membership check so a search-results grid can render filled/empty hearts in one round trip instead of N. */
  @Get("favorites/ids")
  @UseGuards(RequireAuthGuard)
  async findFavoritedIds(@CurrentActor() actor: { userId: string }, @Query("eventIds") eventIds?: string) {
    const ids = eventIds ? eventIds.split(",").filter(Boolean) : [];
    const favorited = await this.favoritesService.favoritedEventIds(actor.userId, ids);
    return { eventIds: [...favorited] };
  }

  @Get(":id")
  @UseGuards(WaitingRoomGuard)
  findOne(@Param("id") id: string, @CurrentActor() actor: { userId: string | null; role: Role | null }) {
    return this.eventsService.findVisible(id, actor);
  }

  @Post(":id/favorite")
  @UseGuards(RequireAuthGuard)
  addFavorite(@Param("id") id: string, @CurrentActor() actor: { userId: string }) {
    return this.favoritesService.add(actor.userId, id);
  }

  @Delete(":id/favorite")
  @UseGuards(RequireAuthGuard)
  removeFavorite(@Param("id") id: string, @CurrentActor() actor: { userId: string }) {
    return this.favoritesService.remove(actor.userId, id);
  }

  @Post()
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @LogActivity({ action: "event.created", targetType: "event", summary: ({ result }) => `Tạo sự kiện "${result.title}"` })
  create(@CurrentActor() actor: { userId: string; role: Role }, @Body() dto: CreateEventDto) {
    // An organizer always creates for themselves; an admin creates on a partner organizer's behalf.
    if (actor.role === Role.ADMIN) {
      if (!dto.organizerId) throw new BadRequestException("Chọn ban tổ chức (organizerId) sở hữu sự kiện này");
      return this.eventsService.create(dto.organizerId, dto);
    }
    return this.eventsService.create(actor.userId, dto);
  }

  @Patch(":id")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @LogActivity({ action: "event.updated", targetType: "event", bodyFields: true, summary: ({ result }) => `Cập nhật sự kiện "${result.title}"` })
  update(@Param("id") id: string, @CurrentActor() actor: { userId: string; role: Role }, @Body() dto: UpdateEventDto) {
    return this.eventsService.update(id, actor, dto);
  }

  /** Online join link + payout/invoice details — owner or admin only, never part of a public read. */
  @Get(":id/private-info")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER, Role.ADMIN)
  getPrivateInfo(@Param("id") id: string, @CurrentActor() actor: { userId: string; role: Role }) {
    return this.eventsService.getPrivateInfo(id, actor);
  }

  // No bodyFields here: bank account / tax code don't belong in the activity log.
  @Put(":id/private-info")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @LogActivity({ action: "event.private_info_updated", targetType: "event", summary: () => "Cập nhật link tham gia / thông tin thanh toán" })
  updatePrivateInfo(@Param("id") id: string, @CurrentActor() actor: { userId: string; role: Role }, @Body() dto: EventPrivateInfoDto) {
    return this.eventsService.updatePrivateInfo(id, actor, dto);
  }

  @Post(":id/submit")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER)
  @LogActivity({ action: "event.submitted", targetType: "event", summary: ({ result }) => `Gửi duyệt sự kiện "${result.title}"` })
  submit(@Param("id") id: string, @CurrentActor() actor: { userId: string }) {
    return this.eventsService.submit(id, actor.userId);
  }

  /** docs/spec/11-implementation-roadmap.md Phase 8b "events.high_demand boolean" — organizer flips this on before a known flash-sale window. */
  @Patch(":id/high-demand")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @LogActivity({ action: "event.high_demand_changed", targetType: "event", summary: ({ result }) => `${result.highDemand ? "Bật" : "Tắt"} phòng chờ cho "${result.title}"` })
  setHighDemand(@Param("id") id: string, @CurrentActor() actor: { userId: string; role: Role }, @Body() dto: SetHighDemandDto) {
    return this.eventsService.setHighDemand(id, actor, dto.enabled);
  }

  /** "Mở bán lại vé còn trống" after the sales deadline, until `until` (≤ event start); null closes it. */
  @Patch(":id/late-sales")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @LogActivity({ action: "event.late_sales_changed", targetType: "event", summary: ({ result }) => (result.lateSalesUntil ? `Mở bán lại vé còn trống của "${result.title}"` : `Đóng mở bán lại "${result.title}"`) })
  setLateSales(@Param("id") id: string, @CurrentActor() actor: { userId: string; role: Role }, @Body() dto: SetLateSalesDto) {
    return this.eventsService.setLateSales(id, actor, dto.until);
  }

  @Patch(":id/approve")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @LogActivity({ action: "event.approved", targetType: "event", summary: ({ result }) => `Duyệt sự kiện "${result.title}"` })
  approve(@Param("id") id: string) {
    return this.eventsService.approve(id);
  }

  @Patch(":id/reject")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @LogActivity({ action: "event.rejected", targetType: "event", summary: ({ result }) => `Từ chối sự kiện "${result.title}": ${result.rejectedReason}` })
  reject(@Param("id") id: string, @Body() dto: RejectEventDto) {
    return this.eventsService.reject(id, dto);
  }

  @Post(":id/cancel-request")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER)
  @LogActivity({ action: "event.cancel_requested", targetType: "event", summary: ({ result }) => `Yêu cầu hủy sự kiện "${result.title}": ${result.cancelRequestReason}` })
  requestCancel(@Param("id") id: string, @CurrentActor() actor: { userId: string }, @Body() dto: RequestCancelEventDto) {
    return this.eventsService.requestCancel(id, actor.userId, dto);
  }

  @Patch(":id/cancel-request/reject")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @LogActivity({ action: "event.cancel_request_rejected", targetType: "event", summary: ({ result, req }) => `Không chấp nhận hủy "${result.title}": ${req.body?.reason}` })
  rejectCancelRequest(@Param("id") id: string, @Body() dto: RejectCancelRequestDto) {
    return this.eventsService.rejectCancelRequest(id, dto);
  }

  @Patch(":id/cancel")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @LogActivity({ action: "event.canceled", targetType: "event", summary: ({ result }) => `Hủy sự kiện "${result.title}": ${result.cancelReason}` })
  cancel(@Param("id") id: string, @Body() dto: CancelEventDto) {
    return this.eventsService.cancel(id, dto);
  }

  @Patch(":id/postpone")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @LogActivity({ action: "event.postponed", targetType: "event", summary: ({ result }) => `Dời sự kiện "${result.title}" sang ${new Date(result.startTime).toLocaleString("vi-VN")}` })
  postpone(@Param("id") id: string, @CurrentActor() actor: { userId: string; role: Role }, @Body() dto: PostponeEventDto) {
    return this.eventsService.postpone(id, actor, dto);
  }
}
