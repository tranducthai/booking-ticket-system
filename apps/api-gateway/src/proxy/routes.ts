/**
 * Path prefix -> backend service map. The gateway is the edge router (no
 * separate Ingress under Docker Swarm); these prefixes are the contract in
 * docs/spec/08-api-contracts.md, and the prefix is stripped before forwarding.
 * Notification Service has no REST API (broker consumer only, see
 * 09-event-contracts.md) so it isn't routed here.
 */
export interface ServiceRoute {
  prefix: string;
  envVar: string;
}

export const SERVICE_ROUTES: ServiceRoute[] = [
  { prefix: "/user", envVar: "USER_SERVICE_URL" },
  { prefix: "/event", envVar: "EVENT_SERVICE_URL" },
  { prefix: "/booking", envVar: "BOOKING_SERVICE_URL" },
  { prefix: "/payment", envVar: "PAYMENT_SERVICE_URL" },
  { prefix: "/ticket", envVar: "TICKET_SERVICE_URL" },
];
