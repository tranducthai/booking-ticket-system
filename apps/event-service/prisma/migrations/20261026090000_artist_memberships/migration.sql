-- Artist membership cards ("Thẻ thành viên") + per-event opt-in for member benefits.
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'CANCELED');

ALTER TABLE "Event" ADD COLUMN "memberBenefits" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ArtistMembershipPlan" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "discountPercent" INTEGER NOT NULL DEFAULT 0,
    "presaleHours" INTEGER NOT NULL DEFAULT 0,
    "benefits" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ArtistMembershipPlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ArtistMembershipPlan_artistId_key" ON "ArtistMembershipPlan"("artistId");
ALTER TABLE "ArtistMembershipPlan" ADD CONSTRAINT "ArtistMembershipPlan_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ArtistMembership" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "cardNumber" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "pricePaid" DECIMAL(12,2) NOT NULL,
    "discountPercent" INTEGER NOT NULL,
    "presaleHours" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArtistMembership_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ArtistMembership_orderId_key" ON "ArtistMembership"("orderId");
CREATE UNIQUE INDEX "ArtistMembership_cardNumber_key" ON "ArtistMembership"("cardNumber");
CREATE INDEX "ArtistMembership_userId_idx" ON "ArtistMembership"("userId");
CREATE INDEX "ArtistMembership_artistId_userId_idx" ON "ArtistMembership"("artistId", "userId");
ALTER TABLE "ArtistMembership" ADD CONSTRAINT "ArtistMembership_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ArtistMembershipPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ArtistMembership" ADD CONSTRAINT "ArtistMembership_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
