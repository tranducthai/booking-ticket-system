import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomInt } from "crypto";
import { MembershipStatus, Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { UpsertMembershipPlanDto } from "./dto/upsert-plan.dto";
import { checkPurchaseWindow } from "./purchase-window";

const DAY = 86_400_000;
const ARTIST_BRIEF = { select: { id: true, name: true, avatarUrl: true } } as const;

export type MembershipFilter = "active" | "expired" | "canceled";

/** What an active card gives on one event — the best of the user's cards among the lineup's artists. */
interface MemberBenefits {
  discountPercent: number;
  presaleHours: number;
  card: { artistName: string; cardNumber: string } | null;
}

const NO_BENEFITS: MemberBenefits = { discountPercent: 0, presaleHours: 0, card: null };

/**
 * Artist membership cards ("Thẻ thành viên"). Buying one is a booking-service
 * order (kind MEMBERSHIP) — this service only owns the plan and the cards,
 * and is told to activate a card once that order is paid (activate()).
 */
@Injectable()
export class MembershipsService {
  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------- plans (admin)

  async upsertPlan(artistId: string, dto: UpsertMembershipPlanDto) {
    const artist = await this.prisma.artist.findUnique({ where: { id: artistId }, select: { id: true } });
    if (!artist) throw new NotFoundException("Không tìm thấy nghệ sĩ");
    const data = { ...dto, benefits: dto.benefits?.trim() || null };
    return this.prisma.artistMembershipPlan.upsert({ where: { artistId }, create: { artistId, ...data }, update: data });
  }

  // ------------------------------------------------------------- cards (customer)

  async listMine(userId: string, filter: MembershipFilter = "active") {
    const now = new Date();
    const where: Prisma.ArtistMembershipWhereInput = { userId };
    if (filter === "canceled") where.status = MembershipStatus.CANCELED;
    else if (filter === "expired") Object.assign(where, { status: MembershipStatus.ACTIVE, expiresAt: { lte: now } });
    // Includes a renewal that starts when the current card ends.
    else Object.assign(where, { status: MembershipStatus.ACTIVE, expiresAt: { gt: now } });

    return this.prisma.artistMembership.findMany({
      where,
      include: { artist: ARTIST_BRIEF, plan: { select: { name: true, benefits: true } } },
      orderBy: filter === "active" ? { startsAt: "asc" } : { expiresAt: "desc" },
    });
  }

  /** Stops the card right away — no refund (the card's page says so before the user confirms). */
  async cancel(id: string, userId: string) {
    const card = await this.prisma.artistMembership.findUnique({ where: { id } });
    if (!card) throw new NotFoundException("Không tìm thấy thẻ thành viên");
    if (card.userId !== userId) throw new ForbiddenException("Đây không phải thẻ của bạn");
    if (card.status === MembershipStatus.CANCELED) return card;
    if (card.expiresAt.getTime() <= Date.now()) throw new BadRequestException("Thẻ đã hết hạn");
    return this.prisma.artistMembership.update({
      where: { id },
      data: { status: MembershipStatus.CANCELED, canceledAt: new Date() },
    });
  }

  // ------------------------------------------------------------- booking-service (internal)

  /** What booking-service needs to open a MEMBERSHIP order. */
  async planForCheckout(planId: string, userId: string) {
    const plan = await this.prisma.artistMembershipPlan.findUnique({ where: { id: planId }, include: { artist: { select: { name: true } } } });
    if (!plan) throw new NotFoundException("Không tìm thấy gói thành viên");
    const current = await this.currentCard(plan.artistId, userId);
    return {
      id: plan.id,
      name: plan.name,
      artistId: plan.artistId,
      artistName: plan.artist.name,
      price: Number(plan.price),
      durationDays: plan.durationDays,
      isActive: plan.isActive,
      activeUntil: current?.expiresAt ?? null,
    };
  }

  /**
   * Called once the MEMBERSHIP order is paid. Idempotent on orderId (the
   * payment saga is at-least-once). Buying while a card is still running is a
   * renewal: the new card starts when the latest one ends.
   */
  async activate(input: { orderId: string; planId: string; userId: string; pricePaid: number }) {
    const existing = await this.prisma.artistMembership.findUnique({ where: { orderId: input.orderId } });
    if (existing) return existing;

    const plan = await this.prisma.artistMembershipPlan.findUnique({ where: { id: input.planId } });
    if (!plan) throw new NotFoundException("Không tìm thấy gói thành viên");

    return this.prisma.$transaction(async (tx) => {
      // Two orders for the same artist paid at once must chain, not overlap.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`membership:${input.userId}:${plan.artistId}`}))`;
      const again = await tx.artistMembership.findUnique({ where: { orderId: input.orderId } });
      if (again) return again;

      const latest = await tx.artistMembership.findFirst({
        where: { userId: input.userId, artistId: plan.artistId, status: MembershipStatus.ACTIVE, expiresAt: { gt: new Date() } },
        orderBy: { expiresAt: "desc" },
      });
      const startsAt = latest?.expiresAt ?? new Date();
      return tx.artistMembership.create({
        data: {
          planId: plan.id,
          artistId: plan.artistId,
          userId: input.userId,
          orderId: input.orderId,
          cardNumber: await this.newCardNumber(tx),
          pricePaid: input.pricePaid,
          discountPercent: plan.discountPercent,
          presaleHours: plan.presaleHours,
          startsAt,
          expiresAt: new Date(startsAt.getTime() + plan.durationDays * DAY),
        },
      });
    });
  }

  // ------------------------------------------------------------- benefits on an event

  /** The event page's "Ưu đãi thành viên" box: which cards count here, and what the viewer's own card gives. */
  async eventBenefits(eventId: string, userId: string | null) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        memberBenefits: true,
        lineup: {
          orderBy: { order: "asc" },
          select: {
            artist: {
              select: {
                id: true,
                name: true,
                membershipPlan: { select: { id: true, name: true, price: true, discountPercent: true, presaleHours: true, isActive: true } },
              },
            },
          },
        },
      },
    });
    if (!event) throw new NotFoundException("Event not found");
    if (!event.memberBenefits) return { memberBenefits: false, offers: [], member: null };

    const offers = event.lineup
      .filter((l) => l.artist.membershipPlan?.isActive)
      .map((l) => ({
        artistId: l.artist.id,
        artistName: l.artist.name,
        planId: l.artist.membershipPlan!.id,
        planName: l.artist.membershipPlan!.name,
        price: Number(l.artist.membershipPlan!.price),
        discountPercent: l.artist.membershipPlan!.discountPercent,
        presaleHours: l.artist.membershipPlan!.presaleHours,
      }));
    const benefits = userId ? await this.benefitsFor(event.lineup.map((l) => l.artist.id), userId) : NO_BENEFITS;
    return {
      memberBenefits: true,
      offers,
      member: benefits.card ? { ...benefits.card, discountPercent: benefits.discountPercent, presaleHours: benefits.presaleHours } : null,
    };
  }

  /**
   * booking-service, before it holds anything: is this purchase inside the
   * sales window (a member's presale counts), and what member discount applies.
   */
  async purchaseCheck(eventId: string, userId: string, ticketTypeIds: string[], includesSeats: boolean) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        salesStartTime: true,
        salesEndTime: true,
        endTime: true,
        memberBenefits: true,
        lineup: { select: { artistId: true } },
        ticketTypes: { where: { id: { in: ticketTypeIds } }, select: { id: true, salesStart: true, salesEnd: true } },
      },
    });
    if (!event) throw new NotFoundException("Event not found");
    if (event.ticketTypes.length !== new Set(ticketTypeIds).size) {
      throw new BadRequestException("Loại vé không thuộc sự kiện này");
    }

    const benefits = event.memberBenefits ? await this.benefitsFor(event.lineup.map((l) => l.artistId), userId) : NO_BENEFITS;
    const window = checkPurchaseWindow({
      now: new Date(),
      event,
      tiers: event.ticketTypes,
      includesSeats,
      presaleHours: benefits.presaleHours,
    });
    if (!window.ok) throw new BadRequestException(window.reason);
    return { discountPercent: benefits.discountPercent, presale: window.presale, artistName: benefits.card?.artistName ?? null };
  }

  // ------------------------------------------------------------- helpers

  private currentCard(artistId: string, userId: string) {
    const now = new Date();
    return this.prisma.artistMembership.findFirst({
      where: { artistId, userId, status: MembershipStatus.ACTIVE, expiresAt: { gt: now } },
      orderBy: { expiresAt: "desc" },
    });
  }

  private async benefitsFor(artistIds: string[], userId: string): Promise<MemberBenefits> {
    if (artistIds.length === 0) return NO_BENEFITS;
    const now = new Date();
    const cards = await this.prisma.artistMembership.findMany({
      where: { userId, artistId: { in: artistIds }, status: MembershipStatus.ACTIVE, startsAt: { lte: now }, expiresAt: { gt: now } },
      include: { artist: { select: { name: true } } },
    });
    if (cards.length === 0) return NO_BENEFITS;
    const best = cards.reduce((a, b) => (b.discountPercent > a.discountPercent ? b : a));
    return {
      discountPercent: best.discountPercent,
      presaleHours: Math.max(...cards.map((c) => c.presaleHours)),
      card: { artistName: best.artist.name, cardNumber: best.cardNumber },
    };
  }

  /** "EP-1234-5678" — random, retried on the (rare) collision. */
  private async newCardNumber(tx: Prisma.TransactionClient): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const n = String(randomInt(0, 100_000_000)).padStart(8, "0");
      const cardNumber = `EP-${n.slice(0, 4)}-${n.slice(4)}`;
      if (!(await tx.artistMembership.findUnique({ where: { cardNumber }, select: { id: true } }))) return cardNumber;
    }
    throw new Error("Could not allocate a membership card number");
  }
}
