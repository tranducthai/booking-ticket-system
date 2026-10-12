import { SetMetadata } from "@nestjs/common";
import type { Request } from "express";

/** What the interceptor hands each callback: the handler's return value and the request. */
export interface LogActivityContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: any;
  req: Request;
}

export interface LogActivitySpec {
  action: string;
  targetType: string;
  summary: (ctx: LogActivityContext) => string;
  /** Defaults: result.id, else :id param. */
  targetId?: (ctx: LogActivityContext) => string | undefined;
  /** Defaults: :eventId param, else result.eventId, else result.id when targetType is "event". */
  eventId?: (ctx: LogActivityContext) => string | undefined;
  /** Record which body fields were sent (names only, never values) — for updates. */
  bodyFields?: boolean;
}

export const LOG_ACTIVITY = "log-activity";

/**
 * Declarative activity logging for plain CRUD endpoints
 * (docs/spec/14-activity-log-design.md §3): written by ActivityLogInterceptor
 * after the handler SUCCEEDS, so a rejected request never leaves a row.
 * Flows with richer context (sagas, cancellations) call
 * ActivityLogService.record() directly instead.
 */
export const LogActivity = (spec: LogActivitySpec) => SetMetadata(LOG_ACTIVITY, spec);
