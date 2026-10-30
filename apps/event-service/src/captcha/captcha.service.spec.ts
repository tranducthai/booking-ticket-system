import { CaptchaService } from "./captcha.service";

/** Just enough of ioredis for CaptchaService. */
class FakeRedis {
  store = new Map<string, string>();
  async incr(key: string) {
    const next = Number(this.store.get(key) ?? 0) + 1;
    this.store.set(key, String(next));
    return next;
  }
  async expire() {
    return 1;
  }
  async set(key: string, value: string) {
    this.store.set(key, value);
    return "OK";
  }
  async getdel(key: string) {
    const v = this.store.get(key) ?? null;
    this.store.delete(key);
    return v;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("CaptchaService", () => {
  let redis: FakeRedis;
  let service: CaptchaService;
  /** What only the server knows: where the gap is. */
  const holeOf = (challengeId: string) => (JSON.parse(redis.store.get(`captcha:ch:${challengeId}`)!) as { x: number }).x;

  beforeEach(() => {
    redis = new FakeRedis();
    service = new CaptchaService(redis as never);
  });

  it("serves the picture with a gap and the piece, without revealing where the gap is", async () => {
    const c = await service.createChallenge("u1");
    expect(c.background.startsWith("data:image/webp;base64,")).toBe(true);
    expect(c.piece.startsWith("data:image/png;base64,")).toBe(true);
    expect(Object.keys(c).sort()).toEqual(["background", "challengeId", "expiresIn", "height", "piece", "pieceSize", "pieceY", "width"]);
    expect(JSON.stringify(c)).not.toContain(`"x":`);
    expect(holeOf(c.challengeId)).toBeGreaterThan(c.pieceSize); // the piece always has to travel
  });

  it("accepts the piece in the gap, then the token works once and only for that user", async () => {
    const c = await service.createChallenge("u1");
    await sleep(750);
    const { token } = await service.verify("u1", c.challengeId, holeOf(c.challengeId));
    expect(await service.consume(token, "u2")).toBe(false);
    expect(await service.consume(token, "u1")).toBe(false); // burnt by the attempt above

    const again = await service.createChallenge("u1");
    await sleep(750);
    const second = await service.verify("u1", again.challengeId, holeOf(again.challengeId));
    expect(await service.consume(second.token, "u1")).toBe(true);
    expect(await service.consume(second.token, "u1")).toBe(false);
  });

  it("allows a few pixels of slack but not a lot", async () => {
    const near = await service.createChallenge("u1");
    await sleep(750);
    await expect(service.verify("u1", near.challengeId, holeOf(near.challengeId) + 4)).resolves.toHaveProperty("token");
    const far = await service.createChallenge("u1");
    await sleep(750);
    await expect(service.verify("u1", far.challengeId, holeOf(far.challengeId) + 30)).rejects.toMatchObject({ response: { code: "CAPTCHA_WRONG" } });
  });

  it("gives one try per challenge", async () => {
    const c = await service.createChallenge("u1");
    const hole = holeOf(c.challengeId);
    await sleep(750);
    await expect(service.verify("u1", c.challengeId, hole + 80)).rejects.toBeDefined();
    await expect(service.verify("u1", c.challengeId, hole)).rejects.toMatchObject({ response: { code: "CAPTCHA_EXPIRED" } });
  });

  it("rejects an answer given faster than a person could slide", async () => {
    const c = await service.createChallenge("u1");
    await expect(service.verify("u1", c.challengeId, holeOf(c.challengeId))).rejects.toMatchObject({ response: { code: "CAPTCHA_WRONG" } });
  });

  it("won't answer another user's challenge", async () => {
    const c = await service.createChallenge("u1");
    await sleep(750);
    await expect(service.verify("u2", c.challengeId, holeOf(c.challengeId))).rejects.toMatchObject({ response: { code: "CAPTCHA_EXPIRED" } });
  });
});
