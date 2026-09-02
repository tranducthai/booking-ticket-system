import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "crypto";
import { QrPayload } from "@booking-ticket-system/event-contracts";

export interface SignedQr {
  qrPayload: string; // base64(JSON.stringify(QrPayload)) + "." + signature — the literal QR image content
  qrSignature: string;
  payload: QrPayload;
}

/**
 * docs/spec/09-event-contracts.md "QR payload" — signed so a check-in scan
 * can be verified OFFLINE first (recompute the HMAC locally, no DB hit,
 * rejects tampered/forged QRs instantly), then confirmed against the DB
 * (authoritative path, catches replay/duplicate-scan — a signature alone
 * can't tell a ticket was already used).
 */
@Injectable()
export class QrSignerService {
  private readonly secret: string;

  constructor(config: ConfigService) {
    this.secret = config.get<string>("TICKET_SIGNING_SECRET") ?? "";
  }

  sign(payload: QrPayload): SignedQr {
    const json = JSON.stringify(payload);
    const signature = this.hmac(json);
    const qrPayload = `${Buffer.from(json, "utf-8").toString("base64")}.${signature}`;
    return { qrPayload, qrSignature: signature, payload };
  }

  /** Returns the decoded payload if the signature is valid, otherwise null — never throws on tampered input. */
  verify(qrPayload: string): QrPayload | null {
    const dotIndex = qrPayload.lastIndexOf(".");
    if (dotIndex === -1) return null;

    const encoded = qrPayload.slice(0, dotIndex);
    const signature = qrPayload.slice(dotIndex + 1);
    let json: string;
    try {
      json = Buffer.from(encoded, "base64").toString("utf-8");
    } catch {
      return null;
    }

    const expected = this.hmac(json);
    if (!timingSafeEqualHex(expected, signature)) {
      return null;
    }
    try {
      return JSON.parse(json) as QrPayload;
    } catch {
      return null;
    }
  }

  private hmac(data: string): string {
    return createHmac("sha256", this.secret).update(data).digest("hex");
  }
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
