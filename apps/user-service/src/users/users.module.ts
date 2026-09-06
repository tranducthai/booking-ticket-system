import { Module } from "@nestjs/common";
import { InternalUsersController } from "./internal-users.controller";
import { PublicUsersController } from "./public-users.controller";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  controllers: [UsersController, InternalUsersController, PublicUsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
