import { gatewayIdentityMiddleware } from "./gateway-identity.middleware";

function run(token: string | undefined, headers: Record<string, string>) {
  const req = { headers: { ...headers } } as any;
  let passed = false;
  gatewayIdentityMiddleware(token)(req, {} as any, () => (passed = true));
  return { passed, headers: req.headers };
}

describe("gatewayIdentityMiddleware", () => {
  const forged = { "x-user-id": "victim", "x-user-role": "ADMIN" };

  it("strips identity headers that didn't come through the gateway", () => {
    const { passed, headers } = run("secret", forged);
    expect(passed).toBe(true);
    expect(headers["x-user-id"]).toBeUndefined();
    expect(headers["x-user-role"]).toBeUndefined();
  });

  it("strips them when the gateway token is wrong", () => {
    expect(run("secret", { ...forged, "x-gateway-token": "guess" }).headers["x-user-id"]).toBeUndefined();
  });

  it("keeps them when the gateway vouches for them", () => {
    expect(run("secret", { ...forged, "x-gateway-token": "secret" }).headers["x-user-role"]).toBe("ADMIN");
  });

  it("keeps them when a sibling service forwards a user's identity", () => {
    expect(run("secret", { ...forged, "x-internal-token": "secret" }).headers["x-user-id"]).toBe("victim");
  });

  it("refuses to start in production without a token", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(() => gatewayIdentityMiddleware(undefined)).toThrow();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
