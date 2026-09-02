import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: "*" });
  const port = process.env.PORT ? Number(process.env.PORT) : 3004;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`payment-service listening on port ${port}`);
}

bootstrap();
