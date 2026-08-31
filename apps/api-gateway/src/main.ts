import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { createProxyMiddleware } from "http-proxy-middleware";
import { AppModule } from "./app.module";
import { createJwtContextMiddleware } from "./proxy/jwt-context.middleware";
import { SERVICE_ROUTES } from "./proxy/routes";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Runs before every proxied request: verifies the access token (if any)
  // and turns it into trusted X-User-Id/X-User-Role headers for downstream
  // services. Must be registered before the proxies below.
  app.use(createJwtContextMiddleware(config.get<string>("JWT_ACCESS_SECRET") ?? ""));

  for (const route of SERVICE_ROUTES) {
    const target = config.get<string>(route.envVar);
    if (!target) {
      // eslint-disable-next-line no-console
      console.warn(`[api-gateway] ${route.envVar} is not set — requests to ${route.prefix} will fail`);
      continue;
    }
    // No pathRewrite here: Express's app.use(prefix, ...) mounting already
    // strips the prefix from req.url before this middleware ever sees it —
    // e.g. a request to /booking/orders/1 arrives here as /orders/1 already.
    // (An explicit `pathRewrite: { '^/user': '' }` looks right but is a trap:
    // it would ALSO match the leading "/user" inside a path like "/users/me"
    // and double-strip it down to "/s/me".)
    app.use(route.prefix, createProxyMiddleware({ target, changeOrigin: true }));
  }

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`api-gateway listening on port ${port}`);
}

bootstrap();
