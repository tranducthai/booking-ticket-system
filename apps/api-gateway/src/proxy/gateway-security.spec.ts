import jwt from "jsonwebtoken";
import { edgeGuardMiddleware } from "./edge-guard.middleware";
import { createJwtContextMiddleware } from "./jwt-context.middleware";

function run(mw: (req: any, res: any, next: () => void) => unknown, req: any) {
  const res = { statusCode: 200, body: undefined as any, status(code: number) { this.statusCode = code; return this; }, json(b: unknown) { this.body = b; return this; } };
  let passed = false;
  const done = mw(req, res, () => (passed = true));
  return Promise.resolve(done).then(() => ({ passed, res, req }));
}

describe("jwtContextMiddleware", () => {
  const secret = "s3cret";
  const sessions = new Map<string, string>([["live", "active"], ["kicked", "revoked:replaced"], ["gone", "revoked:logout"]]);
  const store = {
    status: async (sid: string) => {
      if (sid === "store-down") throw new Error("ECONNREFUSED");
      const v = sessions.get(sid);
      return v === "active" ? { active: true as const } : { active: false as const, reason: v?.slice("revoked:".length) };
    },
  };
  const mw = createJwtContextMiddleware(secret, "gw-token", store);
  const bearer = (claims: object) => ({ authorization: `Bearer ${jwt.sign(claims, secret)}` });

  it("strips forged identity headers from anonymous requests", async () => {
    const { passed, req } = await run(mw, { headers: { "x-user-id": "victim", "x-user-role": "ADMIN", "x-internal-token": "guess" } });
    expect(passed).toBe(true);
    expect(req.headers["x-user-id"]).toBeUndefined();
    expect(req.headers["x-user-role"]).toBeUndefined();
    expect(req.headers["x-internal-token"]).toBeUndefined();
    expect(req.headers["x-gateway-token"]).toBe("gw-token");
  });

  it("replaces forged headers with the token's identity while its session is active", async () => {
    const { passed, req } = await run(mw, { headers: { ...bearer({ sub: "u1", role: "CUSTOMER", sid: "live" }), "x-user-role": "ADMIN" } });
    expect(passed).toBe(true);
    expect(req.headers["x-user-id"]).toBe("u1");
    expect(req.headers["x-user-role"]).toBe("CUSTOMER");
  });

  it("rejects a validly signed token whose session was logged out", async () => {
    const { passed, res } = await run(mw, { headers: bearer({ sub: "u1", role: "CUSTOMER", sid: "gone" }) });
    expect(passed).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe("SESSION_REVOKED");
  });

  it("tells a device that was replaced by a newer login", async () => {
    const { res } = await run(mw, { headers: bearer({ sub: "u1", role: "CUSTOMER", sid: "kicked" }) });
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe("SESSION_REPLACED");
  });

  it("rejects a token without a session id (issued before sessions existed)", async () => {
    const { passed, res } = await run(mw, { headers: bearer({ sub: "u1", role: "ADMIN" }) });
    expect(passed).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it("fails closed when the session store is unreachable", async () => {
    const { passed, res } = await run(mw, { headers: bearer({ sub: "u1", role: "CUSTOMER", sid: "store-down" }) });
    expect(passed).toBe(false);
    expect(res.statusCode).toBe(503);
  });

  it("rejects an unsigned (alg: none) token", async () => {
    const none = jwt.sign({ sub: "u1", role: "ADMIN", sid: "live" }, "", { algorithm: "none" });
    const { passed, res } = await run(mw, { headers: { authorization: `Bearer ${none}` } });
    expect(passed).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it("refuses to start without a secret", () => {
    expect(() => createJwtContextMiddleware("", undefined, store)).toThrow();
  });
});

describe("edgeGuardMiddleware", () => {
  it.each([
    "/payment/internal/payments/o1/auto-refund",
    "/payment//internal/payments/o1/auto-refund",
    "/payment/%69nternal/payments/o1/auto-refund",
    "/user/INTERNAL/users/1",
    "/booking/metrics",
    "/event/docs",
    "/event/docs-json",
  ])("blocks %s", async (path) => {
    const { passed, res } = await run(edgeGuardMiddleware, { path });
    expect(passed).toBe(false);
    expect(res.statusCode).toBe(404);
  });

  it.each(["/event/events", "/payment/refunds/r1", "/ticket/events/e1/check-in", "/health/live"])("allows %s", async (path) => {
    expect((await run(edgeGuardMiddleware, { path })).passed).toBe(true);
  });
});
