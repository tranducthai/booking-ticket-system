import { Body, Controller, Get, Header, Param, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { CurrentActor, Actor } from "../auth/current-actor.decorator";
import { RequireAuthGuard } from "../auth/require-auth.guard";
import { CreatePaymentDto } from "./dto/create-payment.dto";
import { MockCompleteDto } from "./dto/mock-complete.dto";
import { PaymentsService } from "./payments.service";

@Controller("payments")
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly config: ConfigService,
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
   * service). `:provider` is "vnpay" for the real integration.
   */
  @Post("webhook/:provider")
  webhook(@Param("provider") provider: string, @Body() body: Record<string, string>) {
    return this.paymentsService.handleWebhook(provider, body);
  }

  /**
   * Dev/demo only — see gateway/mock.gateway.ts. Renders two links that
   * hit mockComplete below, standing in for a real gateway's checkout page
   * until apps/web (Phase 7b) exists.
   */
  @Get(":id/mock")
  @Header("content-type", "text/html; charset=utf-8")
  mockPage(@Param("id") id: string, @Req() req: Request) {
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
    const payment = await this.paymentsService.completeMock(id, dto.outcome);
    const frontendUrl = this.config.get<string>("FRONTEND_URL") ?? "http://localhost:5173";
    res.redirect(303, `${frontendUrl}/thanh-toan/${payment.orderId}?ket-qua=${dto.outcome}`);
  }
}
