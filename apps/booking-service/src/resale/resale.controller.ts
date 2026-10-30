import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentActor } from "../auth/current-actor.decorator";
import { RequireAuthGuard } from "../auth/require-auth.guard";
import { UserServiceClient } from "../user-client/user-service.client";
import { CreateListingDto } from "./dto/create-listing.dto";
import { ListListingsDto } from "./dto/list-listings.dto";
import { RESALE_FEE_PERCENT, ResaleService } from "./resale.service";

/** "Bán lại vé" — the marketplace is public; listing, withdrawing and buying need an account. */
@Controller("resale")
export class ResaleController {
  constructor(
    private readonly resale: ResaleService,
    private readonly users: UserServiceClient,
  ) {}

  @Get("listings")
  list(@Query() q: ListListingsDto) {
    return this.resale.listPublic(q.eventId, q.page, q.limit);
  }

  /** Must stay above "listings/:id" routes. */
  @Get("listings/mine")
  @UseGuards(RequireAuthGuard)
  mine(@CurrentActor() actor: { userId: string }) {
    return this.resale.listMine(actor.userId);
  }

  @Get("listings/:id")
  one(@Param("id") id: string) {
    return this.resale.getPublic(id);
  }

  @Get("config")
  config() {
    return { feePercent: RESALE_FEE_PERCENT };
  }

  @Post("listings")
  @UseGuards(RequireAuthGuard)
  create(@CurrentActor() actor: { userId: string }, @Body() dto: CreateListingDto) {
    return this.resale.createListing(actor.userId, dto.ticketId, dto.price);
  }

  @Delete("listings/:id")
  @UseGuards(RequireAuthGuard)
  cancel(@Param("id") id: string, @CurrentActor() actor: { userId: string }) {
    return this.resale.cancelListing(id, actor.userId);
  }

  /** Reserve the ticket and open a RESALE order — pay it at /checkout/:orderId like any order. */
  @Post("listings/:id/buy")
  @UseGuards(RequireAuthGuard)
  async buy(@Param("id") id: string, @CurrentActor() actor: { userId: string }) {
    await this.users.assertHasNationalId(actor.userId);
    return this.resale.buy(id, actor.userId);
  }
}
