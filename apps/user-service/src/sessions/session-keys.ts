/**
 * Redis layout of the session allow-list. user-service writes it; api-gateway
 * (src/proxy/session-store.ts) and notification-service (src/inbox/inbox.gateway.ts)
 * read it — same constants copy-pasted there, keep the three in sync.
 *
 *   auth:session:<sid> = "active"            while the session may be used
 *   auth:session:<sid> = "revoked:<reason>"  for a day after it was revoked,
 *                                            so the 401 can say why
 *   (missing)                                expired / unknown → rejected
 *
 * Revocations are also PUBLISHed on SESSION_REVOKED_CHANNEL (message = sid)
 * so open sockets of that session are dropped immediately.
 */
export const sessionKey = (sid: string) => `auth:session:${sid}`;
export const SESSION_ACTIVE = "active";
export const SESSION_REVOKED_CHANNEL = "auth:session-revoked";
export const REVOKED_TOMBSTONE_TTL_SECONDS = 24 * 60 * 60;
