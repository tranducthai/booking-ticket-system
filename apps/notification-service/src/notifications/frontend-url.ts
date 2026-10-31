import { ConfigService } from "@nestjs/config";

/** Base of the links put in emails (FRONTEND_URL, e.g. the Vercel origin), no trailing slash. */
export function frontendUrl(config: ConfigService): string {
  return (config.get<string>("FRONTEND_URL") ?? "http://localhost:3000").replace(/\/+$/, "");
}
