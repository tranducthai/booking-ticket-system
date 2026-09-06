import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MockGateway } from "./mock.gateway";
import { MomoGateway } from "./momo.gateway";
import { GatewayMethod, GATEWAY_METHODS, PaymentGateway } from "./payment-gateway.interface";
import { PaypalGateway } from "./paypal.gateway";
import { VnpaySandboxGateway } from "./vnpay-sandbox.gateway";

/**
 * Replaces a single globally-injected gateway with per-payment dispatch —
 * now that there are 4 real gateways (docs comment on GATEWAY_METHODS),
 * which one applies depends on which button the customer picked
 * (CreatePaymentDto.method / Payment.method), not one process-wide config
 * value. PAYMENT_GATEWAY_MODE keeps its old meaning as an all-or-nothing
 * override though: "mock" (default) routes every method through
 * MockGateway so the whole Saga stays exercisable with zero external
 * credentials; "live" dispatches by method to the real integration, which
 * then needs that gateway's own real credentials configured (see each
 * gateway class's doc comment) or it fails at the provider, not silently.
 */
@Injectable()
export class PaymentGatewayResolver {
  private readonly live: boolean;
  private readonly gateways: Record<GatewayMethod, PaymentGateway>;

  constructor(
    config: ConfigService,
    private readonly mock: MockGateway,
    vnpay: VnpaySandboxGateway,
    momo: MomoGateway,
    paypal: PaypalGateway,
  ) {
    this.live = (config.get<string>("PAYMENT_GATEWAY_MODE") ?? "mock") === "live";
    this.gateways = { vnpay, momo, paypal };
  }

  /** `method` is a Payment.method / CreatePaymentDto.method value, e.g. "vnpay". */
  forMethod(method: string): PaymentGateway {
    if (!this.live) return this.mock;
    if (!this.isGatewayMethod(method)) {
      throw new BadRequestException(`Unsupported payment method: ${method}`);
    }
    return this.gateways[method];
  }

  /** `provider` is the `:provider` path segment on webhook/return routes — "mock" is a valid provider there even though it's never a valid Payment.method. */
  forProvider(provider: string): PaymentGateway {
    if (provider === "mock") {
      // MockGateway.verifyCallback trusts its input unconditionally (no
      // signature to check — see its own doc comment), which is fine while
      // every payment is mock anyway but would let anyone fake-complete a
      // real payment once real money is moving. Refuse it entirely once live.
      if (this.live) throw new BadRequestException("The mock gateway is disabled while PAYMENT_GATEWAY_MODE=live");
      return this.mock;
    }
    return this.forMethod(provider);
  }

  get isLive(): boolean {
    return this.live;
  }

  private isGatewayMethod(method: string): method is GatewayMethod {
    return (GATEWAY_METHODS as readonly string[]).includes(method);
  }
}
