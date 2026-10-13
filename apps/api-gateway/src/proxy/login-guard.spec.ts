import { EventEmitter } from "events";
import { createLoginRateLimitMiddleware } from "./rate-limit.middleware";

/** Minimal Express req/res doubles — the proxy's answer is simulated by setting statusCode and emitting "finish". */
function attempt(mw: ReturnType<typeof createLoginRateLimitMiddleware>, upstreamStatus: number, ip = "1.2.3.4") {
  const req = { method: "POST", path: "/user/auth/login", headers: { "x-forwarded-for": ip }, socket: {} } as never;
  const res = Object.assign(new EventEmitter(), {
    statusCode: 200,
    headers: {} as Record<string, string>,
    set(k: string, v: string) {
      this.headers[k] = v;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json() {
      return this;
    },
  });
  let proxied = false;
  mw(req, res as never, () => {
    proxied = true;
    res.statusCode = upstreamStatus;
    res.emit("finish");
  });
  return { proxied, status: res.statusCode };
}

describe("login guard (failed attempts only)", () => {
  it("never blocks successful logins, however many", () => {
    const mw = createLoginRateLimitMiddleware(5, 60_000);
    for (let i = 0; i < 20; i++) expect(attempt(mw, 201).proxied).toBe(true);
  });

  it("allows 5 wrong passwords, then refuses with 429", () => {
    const mw = createLoginRateLimitMiddleware(5, 60_000);
    for (let i = 0; i < 5; i++) expect(attempt(mw, 401).proxied).toBe(true);
    const blocked = attempt(mw, 201);
    expect(blocked.proxied).toBe(false);
    expect(blocked.status).toBe(429);
  });

  it("a successful login resets the failure count", () => {
    const mw = createLoginRateLimitMiddleware(5, 60_000);
    for (let i = 0; i < 4; i++) attempt(mw, 401);
    attempt(mw, 201);
    for (let i = 0; i < 4; i++) expect(attempt(mw, 401).proxied).toBe(true);
  });

  it("is per client IP", () => {
    const mw = createLoginRateLimitMiddleware(5, 60_000);
    for (let i = 0; i < 5; i++) attempt(mw, 401, "9.9.9.9");
    expect(attempt(mw, 401, "9.9.9.9").proxied).toBe(false);
    expect(attempt(mw, 201, "8.8.8.8").proxied).toBe(true);
  });

  it("lets the IP try again once the lockout has passed", () => {
    jest.useFakeTimers();
    try {
      const mw = createLoginRateLimitMiddleware(5, 60_000);
      for (let i = 0; i < 5; i++) attempt(mw, 401);
      expect(attempt(mw, 201).proxied).toBe(false);
      jest.advanceTimersByTime(60_001);
      expect(attempt(mw, 201).proxied).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});
