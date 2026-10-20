import { JwtService } from "@nestjs/jwt";
import { SessionService } from "./session.service";
import { sessionKey } from "./session-keys";

interface Row {
  id: string;
  userId: string;
  method: string;
  refreshTokenHash: string;
  prevRefreshTokenHash: string | null;
  rotatedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
}

/** Just enough of prisma.session for SessionService — `where` supports the shapes it actually uses. */
function fakePrisma(user: { id: string; email: string; fullName: string; role: string; isLocked: boolean }) {
  const rows = new Map<string, Row>();
  const matches = (r: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => {
      const value = (r as unknown as Record<string, unknown>)[k];
      if (v && typeof v === "object" && "in" in v) return (v as { in: string[] }).in.includes(value as string);
      if (v && typeof v === "object" && "not" in v) return value !== (v as { not: unknown }).not;
      return value === v;
    });
  const session = {
    create: jest.fn(async ({ data }) => {
      rows.set(data.id, { prevRefreshTokenHash: null, rotatedAt: null, revokedAt: null, revokedReason: null, ...data });
    }),
    findMany: jest.fn(async ({ where }) => [...rows.values()].filter((r) => matches(r, where))),
    findUnique: jest.fn(async ({ where }) => {
      const r = rows.get(where.id);
      return r ? { ...r, user } : null;
    }),
    updateMany: jest.fn(async ({ where, data }) => {
      const hit = [...rows.values()].filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    }),
    update: jest.fn(async ({ where, data }) => Object.assign(rows.get(where.id)!, data)),
    delete: jest.fn(async ({ where }) => rows.delete(where.id)),
  };
  return { rows, prisma: { session } };
}

/** In-memory Redis: get/expire + a multi() that supports set (with EX and optional NX) and publish. */
function fakeRedis() {
  const store = new Map<string, string>();
  const published: string[] = [];
  const redis = {
    store,
    published,
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    expire: jest.fn(async () => 1),
    multi() {
      const ops: Array<() => unknown> = [];
      const chain = {
        set(k: string, v: string, ..._args: unknown[]) {
          const nx = _args.includes("NX");
          ops.push(() => {
            if (nx && store.has(k)) return null;
            store.set(k, v);
            return "OK";
          });
          return chain;
        },
        publish(_channel: string, msg: string) {
          ops.push(() => published.push(msg));
          return chain;
        },
        exec: async () => ops.map((op) => [null, op()]),
      };
      return chain;
    },
  };
  return redis;
}

describe("SessionService", () => {
  const user = { id: "u1", email: "a@test.com", fullName: "A", role: "CUSTOMER", isLocked: false };
  const config = {
    get: (key: string) =>
      ({ JWT_ACCESS_SECRET: "access-secret", JWT_REFRESH_SECRET: "refresh-secret", JWT_ACCESS_TTL: "15m", JWT_REFRESH_TTL: "7d" })[key],
  };
  let db: ReturnType<typeof fakePrisma>;
  let redis: ReturnType<typeof fakeRedis>;
  let jwt: JwtService;
  let service: SessionService;

  beforeEach(() => {
    db = fakePrisma({ ...user });
    redis = fakeRedis();
    jwt = new JwtService({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new SessionService(db.prisma as any, jwt, config as any, redis as any, { record: jest.fn() } as any);
  });

  const sidOf = (token: string) => jwt.decode<{ sid: string }>(token).sid;

  it("puts the session id in both tokens and marks it active", async () => {
    const tokens = await service.start(user, "password");
    const sid = sidOf(tokens.accessToken);
    expect(sidOf(tokens.refreshToken)).toBe(sid);
    expect(redis.store.get(sessionKey(sid))).toBe("active");
    expect(await service.isActive(sid)).toBe(true);
  });

  it("allows only one active session per user — a new login revokes the old one", async () => {
    const first = await service.start(user, "password");
    const second = await service.start(user, "google");

    const firstSid = sidOf(first.accessToken);
    expect(redis.store.get(sessionKey(firstSid))).toBe("revoked:replaced");
    expect(redis.published).toContain(firstSid);
    expect(db.rows.get(firstSid)?.revokedReason).toBe("replaced");
    expect(await service.isActive(sidOf(second.accessToken))).toBe(true);
    await expect(service.rotate(first.refreshToken)).rejects.toMatchObject({ response: { code: "SESSION_REPLACED" } });
  });

  it("rotates the refresh token and rejects reuse of a rotated-out one by revoking the session", async () => {
    const tokens = await service.start(user, "password");
    const sid = sidOf(tokens.accessToken);

    const rotated = await service.rotate(tokens.refreshToken);
    expect(rotated.tokens.refreshToken).not.toBe(tokens.refreshToken);

    // Outside the grace window, the old token coming back means someone else has a copy.
    db.rows.get(sid)!.rotatedAt = new Date(Date.now() - 60_000);
    await expect(service.rotate(tokens.refreshToken)).rejects.toMatchObject({ response: { code: "SESSION_REVOKED" } });
    expect(redis.store.get(sessionKey(sid))).toBe("revoked:refresh_reuse");
    await expect(service.rotate(rotated.tokens.refreshToken)).rejects.toBeDefined();
  });

  it("accepts the just-rotated-out token within the grace window (lost response / two tabs)", async () => {
    const tokens = await service.start(user, "password");
    await service.rotate(tokens.refreshToken);

    const again = await service.rotate(tokens.refreshToken);
    expect(again.tokens.accessToken).toBeTruthy();
    expect(await service.isActive(sidOf(tokens.accessToken))).toBe(true);
  });

  it("logout revokes the session immediately, even with an expired refresh token", async () => {
    const tokens = await service.start(user, "password");
    const sid = sidOf(tokens.accessToken);

    await service.logout(tokens.refreshToken);
    expect(redis.store.get(sessionKey(sid))).toBe("revoked:logout");
    expect(await service.isActive(sid)).toBe(false);

    const expired = jwt.sign({ sub: "u1", sid, jti: "x" }, { secret: "refresh-secret", expiresIn: -10 });
    await expect(service.logout(expired)).resolves.toBeUndefined();
  });

  it("revokeAllForUser signs every device out", async () => {
    const tokens = await service.start(user, "password");
    await service.revokeAllForUser("u1", "password_reset");
    expect(await service.isActive(sidOf(tokens.accessToken))).toBe(false);
  });

  it("rejects a pre-session refresh token (no sid)", async () => {
    const legacy = jwt.sign({ sub: "u1" }, { secret: "refresh-secret", expiresIn: "7d" });
    await expect(service.rotate(legacy)).rejects.toMatchObject({ response: { code: "TOKEN_INVALID" } });
  });
});
