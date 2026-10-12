import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { requestContextMiddleware } from "./activity-log/request-context";
import { AppModule } from "./app.module";
import { gatewayIdentityMiddleware } from "./common/gateway-identity.middleware";
import { AllExceptionsFilter } from "./common/all-exceptions.filter";
import { MetricsInterceptor } from "./metrics/metrics.interceptor";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // First: decide whether X-User-* can be trusted at all, before any guard or log reads them.
  app.use(gatewayIdentityMiddleware(app.get(ConfigService).get<string>("INTERNAL_TOKEN") || undefined));
  app.use(requestContextMiddleware); // actor/IP for ActivityLogService — docs/spec/14-activity-log-design.md §3
  app.enableShutdownHooks(); // SIGTERM drain — docs/spec/12-resilience-and-failure-design.md "graceful shutdown"
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(app.get(MetricsInterceptor));
  app.enableCors({ origin: "*" });

  const config = new DocumentBuilder()
    .setTitle("Ticket Service")
    .setDescription("QR generation/signing, check-in — docs/spec/08-api-contracts.md §5")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, config));

  const port = process.env.PORT ? Number(process.env.PORT) : 3005;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`ticket-service listening on port ${port}`);
}

bootstrap();
