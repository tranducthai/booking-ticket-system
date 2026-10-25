import { Module } from "@nestjs/common";
import { InternalMembershipsController } from "./internal-memberships.controller";
import { MembershipsController } from "./memberships.controller";
import { MembershipsService } from "./memberships.service";

@Module({
  controllers: [MembershipsController, InternalMembershipsController],
  providers: [MembershipsService],
})
export class MembershipsModule {}
