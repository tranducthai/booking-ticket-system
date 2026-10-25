import { Module } from "@nestjs/common";
import { HoldsReleaseService } from "./holds-release.service";
import { InternalOrdersController } from "./internal-orders.controller";
import { OrdersController } from "./orders.controller";
import { OrderFulfillmentService } from "./order-fulfillment.service";
import { OrdersService } from "./orders.service";
import { MembershipOrdersService } from "./membership-orders.service";
import { ResaleController } from "../resale/resale.controller";
import { ResaleService } from "../resale/resale.service";

@Module({
  controllers: [OrdersController, InternalOrdersController, ResaleController],
  providers: [OrdersService, HoldsReleaseService, OrderFulfillmentService, MembershipOrdersService, ResaleService],
  exports: [OrdersService, HoldsReleaseService, OrderFulfillmentService],
})
export class OrdersModule {}
