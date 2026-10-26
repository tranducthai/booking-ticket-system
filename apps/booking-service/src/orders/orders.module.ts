import { Module } from "@nestjs/common";
import { HoldsReleaseService } from "./holds-release.service";
import { InternalOrdersController } from "./internal-orders.controller";
import { OrdersController } from "./orders.controller";
import { OrderFulfillmentService } from "./order-fulfillment.service";
import { OrdersService } from "./orders.service";
import { MembershipOrdersService } from "./membership-orders.service";
import { ResaleController } from "../resale/resale.controller";
import { OrganizerStatsController } from "../stats/organizer-stats.controller";
import { OrganizerStatsService } from "../stats/organizer-stats.service";
import { ResaleService } from "../resale/resale.service";

@Module({
  controllers: [OrganizerStatsController, OrdersController, InternalOrdersController, ResaleController],
  providers: [OrdersService, HoldsReleaseService, OrderFulfillmentService, MembershipOrdersService, ResaleService, OrganizerStatsService],
  exports: [OrdersService, HoldsReleaseService, OrderFulfillmentService],
})
export class OrdersModule {}
