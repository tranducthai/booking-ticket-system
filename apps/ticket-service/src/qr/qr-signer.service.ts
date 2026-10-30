import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, createHmac, createPrivateKey, createPublicKey, KeyObject, sign, timingSafeEqual, verify } from "crypto";
import { QrPayload } from "@booking-ticket-system/event-contracts";

export interface SignedQr {
  qrPayload: string; // the literal static-QR content (see formats below)
  qrSignature: string;
  payload: QrPayload;
}

const STATIC_PREFIX = "TBX2";
// PKCS#8 DER header for a raw 32-byte Ed25519 seed (RFC 8410).
const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

/**
 * docs/spec/13-refund-and-anti-fraud-design.md §3. Two code formats (the rotating
 * "TBX2D" code was dropped — a ticket is one static QR carrying the holder's CCCD):
 *
 * - **v2 static** `TBX2.<kid>.<b64url(json QrPayload)>.<b64url(ed25519 sig)>`
 *   — what's stored on the ticket and emailed. Signed with an Ed25519
 *   PRIVATE key that never leaves this service; anything that only needs to
 *   verify (an offline gate scanner) gets the PUBLIC key from
 *   GET /tickets/signing-keys, so a stolen scanner can check tickets but
 *   can't mint them — the weakness of v1's shared HMAC secret.
 * - **v1 legacy** `base64(json).hexHmacSha256` — tickets issued before v2;
 *   still verified so they keep working.
 *
 * Signature checks here are the offline-safe fast path; replay (a
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

  /** Returns null for anything forged, tampered, expired or unrecognized — never throws on hostile input. */
  parse(code: string): QrPayload | null {
    const trimmed = code.trim();
    return trimmed.startsWith(`${STATIC_PREFIX}.`) ? this.verifyStatic(trimmed) : this.verifyLegacy(trimmed);
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
