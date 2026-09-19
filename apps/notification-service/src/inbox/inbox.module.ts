import { Module } from "@nestjs/common";
import { InboxController } from "./inbox.controller";
import { NotificationsGateway } from "./inbox.gateway";
import { InboxService } from "./inbox.service";

@Module({
  controllers: [InboxController],
  providers: [InboxService, NotificationsGateway],
  exports: [InboxService],
})
export class InboxModule {}
