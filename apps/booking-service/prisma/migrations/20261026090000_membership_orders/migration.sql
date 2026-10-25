-- Orders for artist membership cards, and the member discount on ticket orders.
CREATE TYPE "OrderKind" AS ENUM ('TICKETS', 'MEMBERSHIP');

ALTER TABLE "Order" ADD COLUMN "kind" "OrderKind" NOT NULL DEFAULT 'TICKETS',
ADD COLUMN "membershipPlanId" TEXT,
ADD COLUMN "itemLabel" TEXT,
ADD COLUMN "memberDiscountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ALTER COLUMN "eventId" DROP NOT NULL;
