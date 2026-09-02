import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/all-exceptions.filter";
import { MetricsInterceptor } from "./metrics/metrics.interceptor";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks(); // SIGTERM drain — docs/spec/12-resilience-and-failure-design.md "graceful shutdown"
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(app.get(MetricsInterceptor));
  const port = process.env.PORT ? Number(process.env.PORT) : 3006;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`notification-service listening on port ${port}`);
}

bootstrap();
