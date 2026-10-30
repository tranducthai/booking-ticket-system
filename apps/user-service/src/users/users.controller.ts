import { Body, Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { JwtPayload } from "../auth/interfaces/jwt-payload.interface";
import { ListUsersQueryDto } from "./dto/list-users-query.dto";
import { LockUserDto } from "./dto/lock-user.dto";
import { UpdateMeDto } from "./dto/update-me.dto";
import { UpdatePartnerDto } from "./dto/update-partner.dto";
import { UsersService } from "./users.service";

@Controller("users")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  me(@CurrentUser() user: JwtPayload) {
    return this.usersService.findById(user.sub);
  }

  @Patch("me")
  updateMe(@CurrentUser() user: JwtPayload, @Body() dto: UpdateMeDto) {
    return this.usersService.updateMe(user.sub, dto);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  list(@Query() query: ListUsersQueryDto) {
    return this.usersService.listForAdmin(query.page ?? 1, query.limit ?? 20, query.role, query.q);
  }

  @Patch(":id/partner")
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  updatePartner(@Param("id") id: string, @Body() dto: UpdatePartnerDto, @CurrentUser() admin: JwtPayload) {
    return this.usersService.updatePartner(id, dto, admin.sub);
  }

  @Patch(":id/lock")
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  lock(@Param("id") id: string, @Body() dto: LockUserDto, @CurrentUser() admin: JwtPayload) {
    return this.usersService.setLocked(id, dto.isLocked, admin.sub);
  }

  @Patch(":id/verify-organizer")
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  verifyOrganizer(@Param("id") id: string, @CurrentUser() admin: JwtPayload) {
    return this.usersService.verifyOrganizer(id, admin.sub);
  }
}
