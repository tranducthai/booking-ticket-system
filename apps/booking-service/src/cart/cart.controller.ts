import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { CurrentActor } from "../auth/current-actor.decorator";
import { RequireAuthGuard } from "../auth/require-auth.guard";
import { CartService } from "./cart.service";
import { HoldCartDto } from "./dto/hold-cart.dto";

@Controller("cart")
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Post("hold")
  @UseGuards(RequireAuthGuard)
  hold(@CurrentActor() actor: { userId: string }, @Body() dto: HoldCartDto) {
    return this.cartService.holdCart(actor.userId, dto);
  }
}
