import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ? Number(process.env.PORT) : 3006;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`notification-service listening on port ${port}`);
}

bootstrap();
