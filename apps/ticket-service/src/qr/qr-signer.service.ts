import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, createHmac, createPrivateKey, createPublicKey, KeyObject, sign, timingSafeEqual, verify } from "crypto";
import { QrPayload } from "@booking-ticket-system/event-contracts";

export interface SignedQr {
  qrPayload: string; // the literal static-QR content (see formats below)
  qrSignature: string;
  payload: QrPayload;
}

/** What a scanned code turned out to be — see QrSignerService.parse(). */
export type ParsedQr =
  | { kind: "static"; payload: QrPayload }
  | { kind: "dynamic"; ticketId: string; qrVersion: number };

/** Rotating-code period — docs/spec/13-refund-and-anti-fraud-design.md §3.2. */
export const DYNAMIC_STEP_SECONDS = 30;
/** Steps either side of "now" still accepted, to absorb phone/server clock drift. */
const DYNAMIC_STEP_TOLERANCE = 1;

const STATIC_PREFIX = "TBX2";
const DYNAMIC_PREFIX = "TBX2D";
// PKCS#8 DER header for a raw 32-byte Ed25519 seed (RFC 8410).
const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

/**
 * docs/spec/13-refund-and-anti-fraud-design.md §3. Three code formats:
 *
 * - **v2 static** `TBX2.<kid>.<b64url(json QrPayload)>.<b64url(ed25519 sig)>`
 *   — what's stored on the ticket and emailed. Signed with an Ed25519
 *   PRIVATE key that never leaves this service; anything that only needs to
 *   verify (an offline gate scanner) gets the PUBLIC key from
 *   GET /tickets/signing-keys, so a stolen scanner can check tickets but
 *   can't mint them — the weakness of v1's shared HMAC secret.
 * - **v2 dynamic** `TBX2D.<ticketId>.<qrVersion>.<step>.<mac>` — rendered
 *   by the ticket holder's app and regenerated every DYNAMIC_STEP_SECONDS
 *   from a per-ticket seed (dynamicSeed()), Ticketmaster-SafeTix style. A
 *   screenshot stops scanning within ~a minute, which kills the "one
 *   screenshot sold to ten buyers" scam that a signature alone can't.
 * - **v1 legacy** `base64(json).hexHmacSha256` — tickets issued before v2;
 *   still verified so they keep working.
 *
 * Signature/MAC checks here are the offline-safe fast path; replay (a
 * second scan of a genuine code) is caught by the DB status check in
 * tickets.service.ts checkIn(), never here.
 */
@Injectable()
export class QrSignerService {
  private readonly logger = new Logger(QrSignerService.name);
  private readonly secret: string;
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;
  readonly kid: string;

  constructor(config: ConfigService) {
    this.secret = config.get<string>("TICKET_SIGNING_SECRET") ?? "";
    const pem = config.get<string>("TICKET_SIGNING_PRIVATE_KEY");
    if (pem) {
      this.privateKey = createPrivateKey(pem.replace(/\\n/g, "\n"));
    } else {
      // Dev convenience: derive a stable keypair from the HMAC secret so
      // `pnpm start:dev` works with no extra setup. Production sets a real
      // key (scripts/generate-ticket-signing-key.mjs).
      this.logger.warn("TICKET_SIGNING_PRIVATE_KEY not set — deriving the Ed25519 key from TICKET_SIGNING_SECRET (dev only)");
      const seed = createHash("sha256").update(`ticketbox-ed25519:${this.secret}`).digest();
      this.privateKey = createPrivateKey({ key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]), format: "der", type: "pkcs8" });
    }
    this.publicKey = createPublicKey(this.privateKey);
    this.kid =
      config.get<string>("TICKET_SIGNING_KID") ||
      createHash("sha256").update(this.publicKey.export({ format: "der", type: "spki" })).digest("hex").slice(0, 8);
  }

  sign(payload: QrPayload): SignedQr {
    const body = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
    const signature = sign(null, Buffer.from(`${this.kid}.${body}`), this.privateKey).toString("base64url");
    return { qrPayload: `${STATIC_PREFIX}.${this.kid}.${body}.${signature}`, qrSignature: signature, payload };
  }

  /** Public half for offline verifiers — safe to publish. */
  signingKeys() {
    return [{ kid: this.kid, alg: "Ed25519", publicKeyPem: this.publicKey.export({ format: "pem", type: "spki" }).toString() }];
  }

  /**
   * Per-ticket secret the holder's app derives rotating codes from. Never
   * stored: recomputed from the master secret + ticketId + qrVersion, so a
   * reissue (version bump) silently invalidates every code derived from the
   * old seed.
   */
  dynamicSeed(ticketId: string, qrVersion: number): Buffer {
    return createHmac("sha256", this.secret).update(`dyn:${ticketId}:${qrVersion}`).digest();
  }

  /** Mirrors the client-side generator in apps/web/src/lib/dynamicQr.ts — exposed for tests. */
  dynamicCode(ticketId: string, qrVersion: number, step: number): string {
    const mac = createHmac("sha256", this.dynamicSeed(ticketId, qrVersion))
      .update(`${ticketId}.${qrVersion}.${step}`)
      .digest("base64url")
      .slice(0, 22);
    return `${DYNAMIC_PREFIX}.${ticketId}.${qrVersion}.${step}.${mac}`;
  }

  /** Returns null for anything forged, tampered, expired or unrecognized — never throws on hostile input. */
  parse(code: string, now: Date = new Date()): ParsedQr | null {
    const trimmed = code.trim();
    if (trimmed.startsWith(`${DYNAMIC_PREFIX}.`)) return this.parseDynamic(trimmed, now);
    if (trimmed.startsWith(`${STATIC_PREFIX}.`)) {
      const payload = this.verifyStatic(trimmed);
      return payload ? { kind: "static", payload } : null;
    }
    const legacy = this.verifyLegacy(trimmed);
    return legacy ? { kind: "static", payload: legacy } : null;
  }

  private verifyStatic(code: string): QrPayload | null {
    const parts = code.split(".");
    if (parts.length !== 4) return null;
    const [, kid, body, signature] = parts;
    if (kid !== this.kid) return null; // unknown/rotated-out key
    let ok = false;
    try {
      ok = verify(null, Buffer.from(`${kid}.${body}`), this.publicKey, Buffer.from(signature, "base64url"));
    } catch {
      return null;
    }
    if (!ok) return null;
    return this.parseJson(Buffer.from(body, "base64url").toString("utf-8"));
  }

  private parseDynamic(code: string, now: Date): ParsedQr | null {
    const parts = code.split(".");
    if (parts.length !== 5) return null;
    const [, ticketId, versionRaw, stepRaw] = parts;
    const qrVersion = Number(versionRaw);
    const step = Number(stepRaw);
    if (!Number.isInteger(qrVersion) || qrVersion < 1 || !Number.isInteger(step)) return null;

    const currentStep = Math.floor(now.getTime() / 1000 / DYNAMIC_STEP_SECONDS);
    if (Math.abs(currentStep - step) > DYNAMIC_STEP_TOLERANCE) return null; // expired (or a screenshot)

    if (!safeEqual(this.dynamicCode(ticketId, qrVersion, step), code)) return null;
    return { kind: "dynamic", ticketId, qrVersion };
  }

  private verifyLegacy(code: string): QrPayload | null {
    const dotIndex = code.lastIndexOf(".");
    if (dotIndex === -1 || !this.secret) return null;
    const json = Buffer.from(code.slice(0, dotIndex), "base64").toString("utf-8");
    const expected = createHmac("sha256", this.secret).update(json).digest("hex");
    if (!safeEqual(expected, code.slice(dotIndex + 1))) return null;
    return this.parseJson(json);
  }

  private parseJson(json: string): QrPayload | null {
    try {
      const parsed = JSON.parse(json) as QrPayload;
      return typeof parsed.ticketId === "string" && typeof parsed.eventId === "string" ? parsed : null;
    } catch {
      return null;
    }
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
