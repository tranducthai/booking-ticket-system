import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Response } from "express";

/**
 * docs/spec/11-implementation-roadmap.md Phase 8 "Centralized error
 * envelope". Nest's default HttpException shape ({statusCode, message,
 * error} — docs/spec/08-api-contracts.md "Errors") already IS the target
 * envelope, so this filter's only job is making sure everything ELSE
 * (Prisma errors, unexpected bugs) gets forced into that same shape
 * instead of leaking a raw stack trace / framework default 500 page.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("UnhandledException");

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      res.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : exception);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
      error: "Internal Server Error",
    });
  }
}
