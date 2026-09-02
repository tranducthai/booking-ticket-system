import { ConfigService } from "@nestjs/config";
import { QrSignerService } from "./qr-signer.service";

describe("QrSignerService", () => {
  const config = { get: () => "test-secret" } as unknown as ConfigService;
  const signer = new QrSignerService(config);

  const payload = { ticketId: "t1", eventId: "e1", orderItemId: "oi1", issuedAt: "2026-01-01T00:00:00.000Z" };

  it("round-trips a signed payload", () => {
    const signed = signer.sign(payload);
    expect(signer.verify(signed.qrPayload)).toEqual(payload);
  });

  it("rejects a tampered payload", () => {
    const signed = signer.sign(payload);
    const [encoded] = signed.qrPayload.split(".");
    const tamperedJson = JSON.stringify({ ...payload, ticketId: "attacker-ticket" });
    const tampered = `${Buffer.from(tamperedJson, "utf-8").toString("base64")}.${signed.qrSignature}`;
    expect(tampered).not.toBe(signed.qrPayload);
    expect(signer.verify(tampered)).toBeNull();
  });

  it("rejects garbage input without throwing", () => {
    expect(signer.verify("not-a-real-qr-payload")).toBeNull();
    expect(signer.verify("")).toBeNull();
  });

  it("produces a different signature for a different secret", () => {
    const otherSigner = new QrSignerService({ get: () => "different-secret" } as unknown as ConfigService);
    const signed = signer.sign(payload);
    expect(otherSigner.verify(signed.qrPayload)).toBeNull();
  });
});
