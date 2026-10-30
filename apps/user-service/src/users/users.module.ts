import { Module } from "@nestjs/common";
import { SessionsModule } from "../sessions/sessions.module";
import { InternalUsersController } from "./internal-users.controller";
import { PartnerInviteController } from "./partner-invite.controller";
import { PartnerInviteService } from "./partner-invite.service";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [SessionsModule],
  controllers: [UsersController, InternalUsersController, PartnerInviteController],
  providers: [UsersService, PartnerInviteService],
  exports: [UsersService],
})
export class UsersModule {}
