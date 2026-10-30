import { Global, Module } from "@nestjs/common";
import { UserServiceClient } from "./user-service.client";

@Global()
@Module({
  providers: [UserServiceClient],
  exports: [UserServiceClient],
})
export class UserClientModule {}
