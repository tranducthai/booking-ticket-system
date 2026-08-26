/**
 * Path prefix -> backend service map. Mirrors docs/spec/k8s/ingress.yaml
 * exactly (same prefixes, same "strip the prefix before forwarding"
 * rewrite behavior) so local dev routing and the eventual k8s Ingress
 * behave identically. Notification Service has no REST API (broker
 * consumer only, see 09-event-contracts.md) so it isn't routed here.
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
