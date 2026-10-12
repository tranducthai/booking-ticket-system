/**
 * Client half of the rotating ticket QR — docs/spec/13-refund-and-anti-fraud-design.md §3.2.
 * Must stay byte-for-byte compatible with QrSignerService.dynamicCode() in
 * apps/ticket-service/src/qr/qr-signer.service.ts:
 *
 *   TBX2D.<ticketId>.<qrVersion>.<step>.<first 22 chars of base64url(HMAC-SHA256(seed, "<ticketId>.<qrVersion>.<step>"))>
 *
 * The seed comes from GET /tickets/:id (owner only). Computed locally so the
 * code keeps rotating with no network at the venue gate.
 */
function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function bytesToBase64Url(bytes: ArrayBuffer): string {
  let binary = "";
  new Uint8Array(bytes).forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function currentStep(stepSeconds: number, now = Date.now()): number {
  return Math.floor(now / 1000 / stepSeconds);
}

export async function dynamicQrCode(ticketId: string, qrVersion: number, seed: string, step: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", base64UrlToBytes(seed), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ticketId}.${qrVersion}.${step}`));
  return `TBX2D.${ticketId}.${qrVersion}.${step}.${bytesToBase64Url(mac).slice(0, 22)}`;
}
