import { Body, Controller, Get, Param, Patch, Post, Query, StreamableFile, UploadedFiles, UseGuards, UseInterceptors } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import type { RefundReasonCategory } from "@booking-ticket-system/event-contracts";
import { Actor, CurrentActor } from "../auth/current-actor.decorator";
import { RequireAuthGuard } from "../auth/require-auth.guard";
import { Role } from "../auth/role";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { ListMyRefundsDto, ListRefundsDto } from "./dto/list-refunds.dto";
import { RequestRefundDto } from "./dto/request-refund.dto";
import { ApproveRefundDto, OptionalRefundMessageDto, QuoteRefundDto, RefundMessageDto } from "./dto/review-refund.dto";
import { MAX_EVIDENCE_BYTES, MAX_EVIDENCE_FILES, UploadedEvidenceFile } from "./evidence/evidence-storage.service";
import { RefundsService } from "./refunds.service";

/** Multer memory storage, capped at the transport layer too — EvidenceStorageService.validate() then sniffs content. */
const evidenceUpload = FilesInterceptor("files", MAX_EVIDENCE_FILES, { limits: { fileSize: MAX_EVIDENCE_BYTES } });

/** docs/spec/08-api-contracts.md §4 + docs/spec/13-refund-and-anti-fraud-design.md §2.2. */
@Controller("refunds")
export class RefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  @Post()
  @UseGuards(RequireAuthGuard)
  @UseInterceptors(evidenceUpload)
  request(@CurrentActor() actor: Actor, @Body() dto: RequestRefundDto, @UploadedFiles() files?: UploadedEvidenceFile[]) {
    return this.refundsService.request(actor, dto, files ?? []);
  }

  /** Static routes before ":id". */
  @Get("quote")
  @UseGuards(RequireAuthGuard)
  quote(@CurrentActor() actor: Actor, @Query() query: QuoteRefundDto) {
    return this.refundsService.quote(actor, query.orderId, query.reasonCategory as RefundReasonCategory | undefined, query.orderItemIds);
  }

  @Get("mine")
  @UseGuards(RequireAuthGuard)
  listMine(@CurrentActor() actor: Actor, @Query() query: ListMyRefundsDto) {
    return this.refundsService.listMine(actor, query);
  }

  @Get()
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER, Role.ADMIN)
  list(@CurrentActor() actor: Actor, @Query() query: ListRefundsDto) {
    return this.refundsService.list(actor, query);
  }

  @Get(":id")
  @UseGuards(RequireAuthGuard)
  get(@Param("id") id: string, @CurrentActor() actor: Actor) {
    return this.refundsService.get(id, actor);
  }

  @Get(":id/evidence/:evidenceId")
  @UseGuards(RequireAuthGuard)
  async evidence(@Param("id") id: string, @Param("evidenceId") evidenceId: string, @CurrentActor() actor: Actor) {
    const { evidence, stream } = await this.refundsService.openEvidence(id, evidenceId, actor);
    return new StreamableFile(stream, {
      type: evidence.mimeType,
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(evidence.fileName)}`,
      length: evidence.sizeBytes,
    });
  }

  @Patch(":id/approve")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER, Role.ADMIN)
  approve(@Param("id") id: string, @CurrentActor() actor: Actor, @Body() dto: ApproveRefundDto) {
    return this.refundsService.approve(id, actor, dto);
  }

  @Patch(":id/reject")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER, Role.ADMIN)
  reject(@Param("id") id: string, @CurrentActor() actor: Actor, @Body() dto: RefundMessageDto) {
    return this.refundsService.reject(id, actor, dto.message);
  }

  @Patch(":id/need-info")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER, Role.ADMIN)
  requestInfo(@Param("id") id: string, @CurrentActor() actor: Actor, @Body() dto: RefundMessageDto) {
    return this.refundsService.requestInfo(id, actor, dto.message);
  }

  @Patch(":id/retry")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  retry(@Param("id") id: string, @CurrentActor() actor: Actor) {
    return this.refundsService.retry(id, actor);
  }

  @Patch(":id/mark-transferred")
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  markTransferred(@Param("id") id: string, @CurrentActor() actor: Actor) {
    return this.refundsService.markTransferred(id, actor);
  }

  @Post(":id/respond")
  @UseGuards(RequireAuthGuard)
  @UseInterceptors(evidenceUpload)
  respond(
    @Param("id") id: string,
    @CurrentActor() actor: Actor,
    @Body() dto: OptionalRefundMessageDto,
    @UploadedFiles() files?: UploadedEvidenceFile[],
  ) {
    return this.refundsService.respond(id, actor, dto.message, files ?? []);
  }

  @Post(":id/withdraw")
  @UseGuards(RequireAuthGuard)
  withdraw(@Param("id") id: string, @CurrentActor() actor: Actor) {
    return this.refundsService.withdraw(id, actor);
  }

  @Post(":id/escalate")
  @UseGuards(RequireAuthGuard)
  escalate(@Param("id") id: string, @CurrentActor() actor: Actor, @Body() dto: RefundMessageDto) {
    return this.refundsService.escalate(id, actor, dto.message);
  }
}
