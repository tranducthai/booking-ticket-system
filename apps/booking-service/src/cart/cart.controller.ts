import { Body, Controller, Headers, Post, UseGuards } from "@nestjs/common";
import { CurrentActor } from "../auth/current-actor.decorator";
import { RequireAuthGuard } from "../auth/require-auth.guard";
import { UserServiceClient } from "../user-client/user-service.client";
import { CartService } from "./cart.service";
import { HoldCartDto } from "./dto/hold-cart.dto";

@Controller("cart")
export class CartController {
  constructor(
    private readonly cartService: CartService,
    private readonly users: UserServiceClient,
  ) {}

  @Post("hold")
  @UseGuards(RequireAuthGuard)
  async hold(
    @CurrentActor() actor: { userId: string },
    @Body() dto: HoldCartDto,
    @Headers("x-queue-session") queueSession?: string,
  ) {
    await this.users.assertHasNationalId(actor.userId);
    return this.cartService.holdCart(actor.userId, dto, queueSession);
  }
}
