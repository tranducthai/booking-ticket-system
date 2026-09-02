import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/all-exceptions.filter";
import { MetricsInterceptor } from "./metrics/metrics.interceptor";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks(); // SIGTERM drain — docs/spec/12-resilience-and-failure-design.md "graceful shutdown"
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(app.get(MetricsInterceptor));
  app.enableCors({ origin: "*" });

  const config = new DocumentBuilder()
    .setTitle("Payment Service")
    .setDescription("Payment gateway, webhook, refunds — docs/spec/08-api-contracts.md §4")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, config));

  const port = process.env.PORT ? Number(process.env.PORT) : 3004;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`payment-service listening on port ${port}`);
}

bootstrap();
