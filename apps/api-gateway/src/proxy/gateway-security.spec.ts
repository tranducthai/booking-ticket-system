import jwt from "jsonwebtoken";
import { edgeGuardMiddleware } from "./edge-guard.middleware";
import { createJwtContextMiddleware } from "./jwt-context.middleware";

function run(mw: (req: any, res: any, next: () => void) => void, req: any) {
  const res = { statusCode: 200, body: undefined as unknown, status(code: number) { this.statusCode = code; return this; }, json(b: unknown) { this.body = b; return this; } };
  let passed = false;
  mw(req, res, () => (passed = true));
  return { passed, res, req };
}

describe("jwtContextMiddleware", () => {
  const secret = "s3cret";
  const mw = createJwtContextMiddleware(secret, "gw-token");

  it("strips forged identity headers from anonymous requests", () => {
    const { passed, req } = run(mw, { headers: { "x-user-id": "victim", "x-user-role": "ADMIN", "x-internal-token": "guess" } });
    expect(passed).toBe(true);
    expect(req.headers["x-user-id"]).toBeUndefined();
    expect(req.headers["x-user-role"]).toBeUndefined();
    expect(req.headers["x-internal-token"]).toBeUndefined();
    expect(req.headers["x-gateway-token"]).toBe("gw-token");
  });

  it("replaces forged headers with the token's identity", () => {
    const token = jwt.sign({ sub: "u1", role: "CUSTOMER" }, secret);
    const { req } = run(mw, { headers: { authorization: `Bearer ${token}`, "x-user-role": "ADMIN" } });
    expect(req.headers["x-user-id"]).toBe("u1");
    expect(req.headers["x-user-role"]).toBe("CUSTOMER");
  });

  it("rejects an unsigned (alg: none) token", () => {
    const none = jwt.sign({ sub: "u1", role: "ADMIN" }, "", { algorithm: "none" });
    const { passed, res } = run(mw, { headers: { authorization: `Bearer ${none}` } });
    expect(passed).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it("refuses to start without a secret", () => {
    expect(() => createJwtContextMiddleware("")).toThrow();
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
  ])("blocks %s", (path) => {
    const { passed, res } = run(edgeGuardMiddleware, { path });
    expect(passed).toBe(false);
    expect(res.statusCode).toBe(404);
  });

  it.each(["/event/events", "/payment/refunds/r1", "/ticket/events/e1/check-in", "/health/live"])("allows %s", (path) => {
    expect(run(edgeGuardMiddleware, { path }).passed).toBe(true);
  });
});
