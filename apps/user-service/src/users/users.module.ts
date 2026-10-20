import { Module } from "@nestjs/common";
import { SessionsModule } from "../sessions/sessions.module";
import { InternalUsersController } from "./internal-users.controller";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [SessionsModule],
  controllers: [UsersController, InternalUsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
