import { Body, Controller, Get, Header, NotFoundException, Param, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { CurrentActor, Actor } from "../auth/current-actor.decorator";
import { RequireAuthGuard } from "../auth/require-auth.guard";
import { PaymentGatewayResolver } from "../gateway/payment-gateway.resolver";
import { CreatePaymentDto } from "./dto/create-payment.dto";
import { MockCompleteDto } from "./dto/mock-complete.dto";
import { PaymentsService } from "./payments.service";

@Controller("payments")
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly config: ConfigService,
    private readonly gatewayResolver: PaymentGatewayResolver,
  ) {}

  @Post()
  @UseGuards(RequireAuthGuard)
  create(@CurrentActor() actor: Actor, @Body() dto: CreatePaymentDto) {
    return this.paymentsService.create(actor, dto);
  }

  @Get(":id")
  @UseGuards(RequireAuthGuard)
  findOne(@Param("id") id: string, @CurrentActor() actor: Actor) {
    return this.paymentsService.findOwned(id, actor);
  }

  /**
   * docs/spec/08-api-contracts.md §4 — async gateway callback, no user auth
   * (the gateway's signature IS the authentication, verified inside the
   * service). `:provider` is one of GATEWAY_METHODS ("vnpay", "momo",
   * "paypal") for a real integration.
   */
  @Post("webhook/:provider")
  webhook(@Param("provider") provider: string, @Body() body: Record<string, string>) {
    return this.paymentsService.handleWebhook(provider, body);
  }

  /**
   * Browser redirect back from the gateway's own checkout page — every real
   * gateway here (VNPay/MoMo/PayPal) sends the shopper's browser back to
   * this URL with its outcome in the query string, distinct from the
   * server-to-server POST webhook above (see payments.service.ts
   * handleReturn's doc comment on why both exist). Not user-authenticated
   * for the same reason the webhook isn't: the gateway's own signature (or,
   * for PayPal, the capture call itself) is what's actually being trusted.
   */
  @Get("return/:provider")
  async handleReturn(@Param("provider") provider: string, @Req() req: Request, @Res() res: Response) {
    const frontendUrl = this.config.get<string>("FRONTEND_URL") ?? "http://localhost:5173";
    try {
      const payment = await this.paymentsService.handleReturn(provider, req.query as Record<string, string>);
      // Matches mock-complete's own "success"/"fail" values below — CheckoutPage
      // only checks ?ket-qua= for presence, not its exact value, but keep them consistent regardless.
      const outcome = payment.status === "SUCCEEDED" ? "success" : "fail";
      res.redirect(303, `${frontendUrl}/thanh-toan/${payment.orderId}?ket-qua=${outcome}`);
    } catch {
      // No orderId to route back to if the callback itself couldn't be
      // resolved (unknown payment, bad signature) — send the shopper
      // somewhere sane rather than a raw 400/404 with no context.
      res.redirect(303, `${frontendUrl}/don-hang`);
    }
  }

  /**
   * Dev/demo only — see gateway/mock.gateway.ts. Renders two links that
   * hit mockComplete below, standing in for a real gateway's checkout page
   * until apps/web (Phase 7b) exists.
   */
  @Get(":id/mock")
  @Header("content-type", "text/html; charset=utf-8")
  mockPage(@Param("id") id: string, @Req() req: Request) {
    this.ensureMockAllowed();
    const base = `${req.protocol}://${req.get("host")}`;
    return `<!doctype html><html><body style="font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center">
      <h2>Mock payment gateway</h2>
      <p>Payment <code>${id}</code> — this page stands in for a real VNPay checkout (PAYMENT_GATEWAY_MODE=mock).</p>
      <form method="post" action="${base}/payments/${id}/mock-complete" style="display:inline">
        <input type="hidden" name="outcome" value="success" />
        <button type="submit" style="padding:10px 20px;background:#178f58;color:#fff;border:0;border-radius:6px;cursor:pointer">Simulate success</button>
      </form>
      <form method="post" action="${base}/payments/${id}/mock-complete" style="display:inline;margin-left:12px">
        <input type="hidden" name="outcome" value="fail" />
        <button type="submit" style="padding:10px 20px;background:#b3261e;color:#fff;border:0;border-radius:6px;cursor:pointer">Simulate failure</button>
      </form>
    </body></html>`;
  }

  @Post(":id/mock-complete")
  async mockComplete(@Param("id") id: string, @Body() dto: MockCompleteDto, @Res() res: Response) {
    this.ensureMockAllowed();
    const payment = await this.paymentsService.completeMock(id, dto.outcome);
    const frontendUrl = this.config.get<string>("FRONTEND_URL") ?? "http://localhost:5173";
    res.redirect(303, `${frontendUrl}/thanh-toan/${payment.orderId}?ket-qua=${dto.outcome}`);
  }

  /** Both mock-only routes above 404 once PAYMENT_GATEWAY_MODE=live — see PaymentGatewayResolver.forProvider's doc comment on why. */
  private ensureMockAllowed(): void {
    if (this.gatewayResolver.isLive) {
      throw new NotFoundException();
    }
  }
}
