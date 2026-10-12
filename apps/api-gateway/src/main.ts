import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { createProxyMiddleware } from "http-proxy-middleware";
import { AppModule } from "./app.module";
import { createBulkheadMiddleware } from "./proxy/bulkhead.middleware";
import { edgeGuardMiddleware } from "./proxy/edge-guard.middleware";
import { createJwtContextMiddleware } from "./proxy/jwt-context.middleware";
import { createGeneralRateLimitMiddleware, createLoginRateLimitMiddleware } from "./proxy/rate-limit.middleware";
import { SERVICE_ROUTES } from "./proxy/routes";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks(); // SIGTERM drain — docs/spec/12-resilience-and-failure-design.md "graceful shutdown"
  const config = app.get(ConfigService);

  // apps/web talks to the gateway cross-origin in a real deployment (Vite's
  // dev proxy makes this a non-issue locally, see apps/web/vite.config.ts).
  app.enableCors({ origin: config.get<string>("CORS_ORIGIN") ?? "*" });

  // docs/spec/12-resilience-and-failure-design.md bulkhead/load-shed +
  // docs/spec/04-deployment-design.md §2a auth-burst rate limiting — both
  // ahead of the JWT middleware so a shed request never even reaches token
  // verification, let alone a downstream service.
  const generalLimit = Number(config.get<string>("RATE_LIMIT_GENERAL_PER_MIN") ?? 300);
  const loginLimit = Number(config.get<string>("RATE_LIMIT_LOGIN_PER_MIN") ?? 5);
  app.use(createGeneralRateLimitMiddleware(generalLimit, 60_000));
  app.use(createLoginRateLimitMiddleware(loginLimit, 60_000));

  // Internal/metrics/docs routes never leave the private network.
  app.use(edgeGuardMiddleware);

  // Runs before every proxied request: strips client-forged identity
  // headers, verifies the access token (if any) and turns it into trusted
  // X-User-Id/X-User-Role (+ X-Gateway-Token) headers for downstream
  // services. Must be registered before the proxies below.
  const internalToken = config.get<string>("INTERNAL_TOKEN") || undefined;
  if (!internalToken && process.env.NODE_ENV === "production") {
    throw new Error("INTERNAL_TOKEN is not set — downstream services couldn't tell gateway traffic from forged headers");
  }
  app.use(createJwtContextMiddleware(config.get<string>("JWT_ACCESS_SECRET") ?? "", internalToken));

  for (const route of SERVICE_ROUTES) {
    const target = config.get<string>(route.envVar);
    if (!target) {
      // eslint-disable-next-line no-console
      console.warn(`[api-gateway] ${route.envVar} is not set — requests to ${route.prefix} will fail`);
      continue;
    }
    app.use(route.prefix, createBulkheadMiddleware(route.prefix, route.bulkhead));
    // No pathRewrite here: Express's app.use(prefix, ...) mounting already
    // strips the prefix from req.url before this middleware ever sees it —
    // e.g. a request to /booking/orders/1 arrives here as /orders/1 already.
    // (An explicit `pathRewrite: { '^/user': '' }` looks right but is a trap:
    // it would ALSO match the leading "/user" inside a path like "/users/me"
    // and double-strip it down to "/s/me".)
    // xfwd: append the real client to X-Forwarded-For so downstream activity
    // logs record it (docs/spec/14-activity-log-design.md §3 — services
    // trust only the LAST entry, the one this hop added).
    app.use(route.prefix, createProxyMiddleware({ target, changeOrigin: true, xfwd: true }));
  }

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`api-gateway listening on port ${port}`);
}

bootstrap();
