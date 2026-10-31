import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { AppModule } from "./app.module";
import { createBulkheadMiddleware } from "./proxy/bulkhead.middleware";
import { edgeGuardMiddleware } from "./proxy/edge-guard.middleware";
import { createJwtContextMiddleware } from "./proxy/jwt-context.middleware";
import { clientIp, createGeneralRateLimitMiddleware, createLoginRateLimitMiddleware } from "./proxy/rate-limit.middleware";
import { SERVICE_ROUTES } from "./proxy/routes";
import { createSecurityHeadersMiddleware } from "./proxy/security-headers.middleware";
import { RedisSessionStore } from "./proxy/session-store";
import { UpstreamWaker } from "./proxy/wake-upstream.middleware";

/** CORS_ORIGIN: comma-separated list of allowed origins (the apps/web URL), or "*". */
function corsOrigin(raw: string | undefined, production: boolean): string | string[] {
  const origins = (raw ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  if (origins.length === 0) {
    if (production) throw new Error("CORS_ORIGIN is not set — set it to the frontend's origin (e.g. https://ticketbox.vercel.app)");
    return "*";
  }
  if (origins.includes("*")) {
    if (production) console.warn("[api-gateway] CORS_ORIGIN=* — any website can call this API from a visitor's browser");
    return "*";
  }
  return origins;
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableShutdownHooks(); // SIGTERM drain — docs/spec/12-resilience-and-failure-design.md "graceful shutdown"
  const config = app.get(ConfigService);
  const production = process.env.NODE_ENV === "production";

  // How many reverse proxies sit in front of this process (Render's edge = 1,
  // a bare `docker run` / local dev = 0). Express then takes req.ip from
  // that many X-Forwarded-For hops from the right — the entries a client
  // can't forge. Too high and clients can spoof their IP; too low and
  // every client looks like the proxy (one shared rate-limit/lockout bucket).
  app.set("trust proxy", Number(config.get<string>("TRUST_PROXY_HOPS") ?? 0));
  app.disable("x-powered-by");
  app.use(createSecurityHeadersMiddleware(production));

  // apps/web talks to the gateway cross-origin in a real deployment (Vite's
  // dev proxy makes this a non-issue locally, see apps/web/vite.config.ts).
  app.enableCors({ origin: corsOrigin(config.get<string>("CORS_ORIGIN"), production) });

  // docs/spec/12-resilience-and-failure-design.md bulkhead/load-shed +
  // docs/spec/04-deployment-design.md §2a auth-burst rate limiting — both
  // ahead of the JWT middleware so a shed request never even reaches token
  // verification, let alone a downstream service.
  const generalLimit = Number(config.get<string>("RATE_LIMIT_GENERAL_PER_MIN") ?? 300);
  const loginMaxFailures = Number(config.get<string>("LOGIN_MAX_FAILURES") ?? 5);
  const loginLockoutMinutes = Number(config.get<string>("LOGIN_LOCKOUT_MINUTES") ?? 15);
  app.use(createGeneralRateLimitMiddleware(generalLimit, 60_000));
  app.use(createLoginRateLimitMiddleware(loginMaxFailures, loginLockoutMinutes * 60_000));

  // Internal/metrics/docs routes never leave the private network.
  app.use(edgeGuardMiddleware);

  // Runs before every proxied request: strips client-forged identity
  // headers, verifies the access token (if any) and its session, and turns
  // it into trusted X-User-Id/X-User-Role (+ X-Gateway-Token) headers for
  // downstream services. Must be registered before the proxies below.
  const internalToken = config.get<string>("INTERNAL_TOKEN") || undefined;
  if (!internalToken && production) {
    throw new Error("INTERNAL_TOKEN is not set — downstream services couldn't tell gateway traffic from forged headers");
  }
  const redisUrl = config.get<string>("REDIS_URL");
  if (!redisUrl && production) {
    throw new Error("REDIS_URL is not set — the gateway can't tell a logged-out access token from a live one");
  }
  const sessions = new RedisSessionStore(redisUrl ?? "redis://localhost:6379");
  app.use(createJwtContextMiddleware(config.get<string>("JWT_ACCESS_SECRET") ?? "", internalToken, sessions));

  // Holds a request while a downstream that's been idle (and may be asleep
  // on a free-tier host) boots, instead of returning the host's 502.
  const waker = new UpstreamWaker();
  for (const route of SERVICE_ROUTES) {
    const target = config.get<string>(route.envVar);
    if (target) waker.register(route.prefix, target);
  }

  for (const route of SERVICE_ROUTES) {
    const target = config.get<string>(route.envVar);
    if (!target) {
      // eslint-disable-next-line no-console
      console.warn(`[api-gateway] ${route.envVar} is not set — requests to ${route.prefix} will fail`);
      continue;
    }
    app.use(route.prefix, waker.middleware(route.prefix)); // before the bulkhead: a request waiting on a cold start doesn't hold a concurrency slot
    app.use(route.prefix, createBulkheadMiddleware(route.prefix, route.bulkhead));
    // No pathRewrite here: Express's app.use(prefix, ...) mounting already
    // strips the prefix from req.url before this middleware ever sees it —
    // e.g. a request to /booking/orders/1 arrives here as /orders/1 already.
    // (An explicit `pathRewrite: { '^/user': '' }` looks right but is a trap:
    // it would ALSO match the leading "/user" inside a path like "/users/me"
    // and double-strip it down to "/s/me".)
    // X-Forwarded-For: downstream activity logs record its LAST entry
    // (docs/spec/14-activity-log-design.md §3). xfwd alone would append this
    // hop's socket peer — on Render that's the edge proxy, not the client —
    // so the header is replaced with the one IP the gateway itself trusts.
    app.use(
      route.prefix,
      createProxyMiddleware({
        target,
        changeOrigin: true,
        xfwd: true,
        on: {
          proxyReq: (proxyReq, req) => {
            proxyReq.setHeader("x-forwarded-for", clientIp(req as Parameters<typeof clientIp>[0]));
          },
        },
      }),
    );
  }

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`api-gateway listening on port ${port}`);
}

bootstrap();
