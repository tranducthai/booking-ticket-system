import { Module } from "@nestjs/common";
import { HoldsReleaseService } from "./holds-release.service";
import { InternalOrdersController } from "./internal-orders.controller";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  controllers: [OrdersController, InternalOrdersController],
  providers: [OrdersService, HoldsReleaseService],
  exports: [OrdersService, HoldsReleaseService],
})
export class OrdersModule {}
