#!/usr/bin/env node
// docs/spec/13-refund-and-anti-fraud-design.md §3.1 — prints a fresh Ed25519
// keypair for ticket-service's TICKET_SIGNING_PRIVATE_KEY. Keep the private
// key in the secret store; the public half is served by GET /tickets/signing-keys.
import { createHash, generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
const kid = createHash("sha256").update(publicKey.export({ format: "der", type: "spki" })).digest("hex").slice(0, 8);

console.log(`TICKET_SIGNING_KID=${kid}`);
console.log(`TICKET_SIGNING_PRIVATE_KEY="${pem.trim().replace(/\n/g, "\n")}"`);
