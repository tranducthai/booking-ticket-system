import { Module } from "@nestjs/common";
import { DiscountCodesController } from "./discount-codes.controller";
import { DiscountCodesService } from "./discount-codes.service";

@Module({
  controllers: [DiscountCodesController],
  providers: [DiscountCodesService],
})
export class DiscountCodesModule {}
