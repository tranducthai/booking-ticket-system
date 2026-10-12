import { BadGatewayException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import CircuitBreaker from "opossum";
import { RefundEventContext } from "../refunds/refund-policy";

/**
 * Reads event-service's internal refund context (policy, start time,
 * postponement window, organizer) — docs/spec/13-refund-and-anti-fraud-design.md §2.
 * Behind a breaker like BookingServiceClient.getOrder(): it's on the path
 * of every refund quote/request/review.
 */
@Injectable()
export class EventServiceClient {
  private readonly baseUrl: string;
  private readonly internalToken?: string;
  private readonly breaker: CircuitBreaker<[string], RefundEventContext>;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>("EVENT_SERVICE_URL") ?? "http://localhost:3002";
    this.internalToken = config.get<string>("INTERNAL_TOKEN") || undefined;
    this.breaker = new CircuitBreaker((eventId: string) => this.rawGetRefundContext(eventId), {
      timeout: 5000,
      errorThresholdPercentage: 50,
      resetTimeout: 15000,
      rollingCountTimeout: 10000,
      volumeThreshold: 5,
      errorFilter: (err) => err instanceof NotFoundException,
    });
  }

  async getRefundContext(eventId: string): Promise<RefundEventContext> {
    try {
      return await this.breaker.fire(eventId);
    } catch (err) {
      if (this.breaker.opened) {
        throw new ServiceUnavailableException("Event Service is temporarily unavailable");
      }
      throw err;
    }
  }

  private async rawGetRefundContext(eventId: string): Promise<RefundEventContext> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/internal/events/${eventId}/refund-context`, {
        headers: this.internalToken ? { "x-internal-token": this.internalToken } : {},
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new BadGatewayException("Event Service is unreachable");
    }
    if (res.status === 404) throw new NotFoundException("Event not found");
    if (!res.ok) throw new BadGatewayException("Event Service is unavailable");
    return (await res.json()) as RefundEventContext;
  }
}
