import { ConfigService } from "@nestjs/config";
import { createHmac } from "crypto";
import { DYNAMIC_STEP_SECONDS, QrSignerService } from "./qr-signer.service";

function signerWith(env: Record<string, string>) {
  return new QrSignerService({ get: (key: string) => env[key] } as unknown as ConfigService);
}

describe("QrSignerService", () => {
  const signer = signerWith({ TICKET_SIGNING_SECRET: "test-secret" });
  const payload = { ticketId: "t1", eventId: "e1", orderItemId: "oi1", issuedAt: "2026-01-01T00:00:00.000Z", qrVersion: 1 };

  describe("v2 static (Ed25519)", () => {
    it("round-trips a signed payload", () => {
      const signed = signer.sign(payload);
      expect(signed.qrPayload.startsWith("TBX2.")).toBe(true);
      expect(signer.parse(signed.qrPayload)).toEqual({ kind: "static", payload });
    });

    it("rejects a tampered payload", () => {
      const [prefix, kid, , sig] = signer.sign(payload).qrPayload.split(".");
      const forgedBody = Buffer.from(JSON.stringify({ ...payload, ticketId: "attacker-ticket" })).toString("base64url");
      expect(signer.parse(`${prefix}.${kid}.${forgedBody}.${sig}`)).toBeNull();
    });

    it("rejects a code signed by a different key", () => {
      const other = signerWith({ TICKET_SIGNING_SECRET: "different-secret" });
      expect(signer.parse(other.sign(payload).qrPayload)).toBeNull();
    });

    it("is stable across restarts when the key is derived from the secret", () => {
      const restarted = signerWith({ TICKET_SIGNING_SECRET: "test-secret" });
      expect(restarted.parse(signer.sign(payload).qrPayload)).not.toBeNull();
    });

    it("publishes only the public key", () => {
      const [key] = signer.signingKeys();
      expect(key.alg).toBe("Ed25519");
      expect(key.publicKeyPem).toContain("BEGIN PUBLIC KEY");
      expect(key.publicKeyPem).not.toContain("PRIVATE");
    });
  });

  describe("v2 dynamic (rotating)", () => {
    const now = new Date("2026-10-10T10:00:00.000Z");
    const step = Math.floor(now.getTime() / 1000 / DYNAMIC_STEP_SECONDS);

    it("accepts the current step and one step of clock drift", () => {
      for (const s of [step - 1, step, step + 1]) {
        expect(signer.parse(signer.dynamicCode("t1", 3, s), now)).toEqual({ kind: "dynamic", ticketId: "t1", qrVersion: 3 });
      }
    });

    it("rejects a screenshot older than the tolerance window", () => {
      expect(signer.parse(signer.dynamicCode("t1", 3, step - 2), now)).toBeNull();
    });

    it("rejects a code whose ticket or version was edited", () => {
      const code = signer.dynamicCode("t1", 3, step);
      expect(signer.parse(code.replace(".3.", ".4."), now)).toBeNull();
      expect(signer.parse(code.replace("TBX2D.t1.", "TBX2D.t2."), now)).toBeNull();
    });

    it("derives a different seed per version, so reissuing kills old codes", () => {
      expect(signer.dynamicSeed("t1", 1).equals(signer.dynamicSeed("t1", 2))).toBe(false);
    });
  });

  describe("v1 legacy (HMAC)", () => {
    it("still verifies tickets issued before v2", () => {
      const json = JSON.stringify({ ticketId: "t1", eventId: "e1", orderItemId: "oi1", issuedAt: "2026-01-01T00:00:00.000Z" });
      const legacy = `${Buffer.from(json).toString("base64")}.${createHmac("sha256", "test-secret").update(json).digest("hex")}`;
      expect(signer.parse(legacy)).toEqual({ kind: "static", payload: JSON.parse(json) });
    });
  });

  it("rejects garbage input without throwing", () => {
    for (const junk of ["", "not-a-real-qr-payload", "TBX2.", "TBX2D.a.b.c.d", "TBX2.x.y.z"]) {
      expect(signer.parse(junk)).toBeNull();
    }
  });
});
