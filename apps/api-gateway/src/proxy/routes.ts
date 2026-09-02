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
  /** docs/spec/12-resilience-and-failure-design.md bulkhead — max concurrent in-flight requests to this downstream before the gateway load-sheds with 503. Sized roughly to each service's own expected load (Event Service is the hottest read path — docs/spec/04-deployment-design.md §2a — so it gets the largest budget). */
  bulkhead: number;
}

export const SERVICE_ROUTES: ServiceRoute[] = [
  { prefix: "/user", envVar: "USER_SERVICE_URL", bulkhead: 100 },
  { prefix: "/event", envVar: "EVENT_SERVICE_URL", bulkhead: 300 },
  { prefix: "/booking", envVar: "BOOKING_SERVICE_URL", bulkhead: 150 },
  { prefix: "/payment", envVar: "PAYMENT_SERVICE_URL", bulkhead: 80 },
  { prefix: "/ticket", envVar: "TICKET_SERVICE_URL", bulkhead: 100 },
];
