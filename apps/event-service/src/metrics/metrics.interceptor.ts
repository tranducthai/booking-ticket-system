import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { MetricsService } from "./metrics.service";

/** Applied globally in main.ts — records every request's duration/count, labeled by route pattern (not the raw URL, which would blow up cardinality with UUIDs). */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const route = req.route?.path ?? req.path ?? "unknown";
    const end = this.metrics.httpRequestDuration.startTimer({ method: req.method, route });

    return next.handle().pipe(
      tap({
        next: () => this.record(end, req.method, route, res.statusCode),
        error: () => this.record(end, req.method, route, res.statusCode || 500),
      }),
    );
  }

  private record(end: (labels?: Record<string, string | number>) => number, method: string, route: string, status: number) {
    end({ status });
    this.metrics.httpRequestsTotal.inc({ method, route, status });
  }
}
