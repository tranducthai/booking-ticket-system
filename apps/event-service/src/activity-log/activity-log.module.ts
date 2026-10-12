import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { ActivityLogController } from "./activity-log.controller";
import { ActivityLogInterceptor } from "./activity-log.interceptor";
import { ActivityLogService } from "./activity-log.service";

/** Global so any service class can inject ActivityLogService without importing this module. */
@Global()
@Module({
  controllers: [ActivityLogController],
  providers: [ActivityLogService, { provide: APP_INTERCEPTOR, useClass: ActivityLogInterceptor }],
  exports: [ActivityLogService],
})
export class ActivityLogModule {}
