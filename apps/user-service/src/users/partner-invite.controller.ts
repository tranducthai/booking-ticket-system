import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { JwtPayload } from "../auth/interfaces/jwt-payload.interface";
import { AcceptPartnerInviteDto, InvitePartnerDto } from "./dto/invite-partner.dto";
import { PartnerInviteService } from "./partner-invite.service";

@Controller("partner-invites")
export class PartnerInviteController {
  constructor(private readonly invites: PartnerInviteService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  invite(@Body() dto: InvitePartnerDto, @CurrentUser() admin: JwtPayload) {
    return this.invites.invite(dto, admin.sub);
  }

  /** Public — the invitee isn't signed in; the token is the credential. */
  @Get("preview")
  preview(@Query("token") token = "") {
    return this.invites.preview(token);
  }

  @Post("accept")
  @HttpCode(HttpStatus.OK)
  accept(@Body() dto: AcceptPartnerInviteDto) {
    return this.invites.accept(dto.token, dto.password);
  }
}
