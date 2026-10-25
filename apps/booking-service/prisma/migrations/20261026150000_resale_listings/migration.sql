-- "Bán lại vé": customer resale listings + RESALE orders.
ALTER TYPE "OrderKind" ADD VALUE 'RESALE';
CREATE TYPE "ResaleStatus" AS ENUM ('ACTIVE', 'RESERVED', 'SOLD', 'CANCELED');

ALTER TABLE "Order" ADD COLUMN "resaleListingId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "transferredAt" TIMESTAMP(3);

CREATE TABLE "ResaleListing" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "ticketTypeId" TEXT,
    "seatId" TEXT,
    "facePrice" DECIMAL(12,2) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "feeAmount" DECIMAL(12,2) NOT NULL,
    "status" "ResaleStatus" NOT NULL DEFAULT 'ACTIVE',
    "reservedOrderId" TEXT,
    "buyerId" TEXT,
    "soldAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ResaleListing_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ResaleListing_code_key" ON "ResaleListing"("code");
CREATE INDEX "ResaleListing_eventId_status_idx" ON "ResaleListing"("eventId", "status");
CREATE INDEX "ResaleListing_sellerId_idx" ON "ResaleListing"("sellerId");
CREATE INDEX "ResaleListing_ticketId_idx" ON "ResaleListing"("ticketId");
