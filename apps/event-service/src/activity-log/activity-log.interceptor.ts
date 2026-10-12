import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { mergeMap, Observable } from "rxjs";
import { ActivityLogService } from "./activity-log.service";
import { LOG_ACTIVITY, LogActivitySpec } from "./log-activity.decorator";

/** Executes @LogActivity specs — see that decorator's doc comment. */
@Injectable()
export class ActivityLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ActivityLogInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly activity: ActivityLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const spec = this.reflector.get<LogActivitySpec | undefined>(LOG_ACTIVITY, context.getHandler());
    if (!spec) return next.handle();
    const req = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      mergeMap(async (result) => {
        // The action already succeeded — a bug in a spec callback must not turn that into a 500.
        try {
          const ctx = { result, req };
          const params = (req.params ?? {}) as Record<string, string>; // Express 5 types params as string | string[]
          const eventId =
            spec.eventId?.(ctx) ?? params.eventId ?? result?.eventId ?? (spec.targetType === "event" ? result?.id : undefined);
          await this.activity.record({
            action: spec.action,
            targetType: spec.targetType,
            targetId: spec.targetId?.(ctx) ?? result?.id ?? params.id,
            eventId,
            summary: spec.summary(ctx),
            metadata: spec.bodyFields && req.body && typeof req.body === "object" ? { fields: Object.keys(req.body) } : undefined,
          });
        } catch (err) {
          this.logger.warn(`@LogActivity(${spec.action}) failed: ${(err as Error).message}`);
        }
        return result;
      }),
    );
  }
}
