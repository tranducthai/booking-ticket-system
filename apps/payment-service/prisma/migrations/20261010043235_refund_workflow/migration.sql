-- CreateEnum
CREATE TYPE "RefundKind" AS ENUM ('CUSTOMER_REQUEST', 'EVENT_CANCELED', 'EVENT_POSTPONED', 'SYSTEM_ERROR');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RefundStatus" ADD VALUE 'NEED_INFO';
ALTER TYPE "RefundStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "RefundStatus" ADD VALUE 'FAILED';
ALTER TYPE "RefundStatus" ADD VALUE 'ESCALATED';
ALTER TYPE "RefundStatus" ADD VALUE 'REJECTED_FINAL';
ALTER TYPE "RefundStatus" ADD VALUE 'WITHDRAWN';

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "eventId" TEXT,
ADD COLUMN     "gatewayRefundId" TEXT,
ADD COLUMN     "grossAmount" DECIMAL(12,2),
ADD COLUMN     "infoRequest" TEXT,
ADD COLUMN     "kind" "RefundKind" NOT NULL DEFAULT 'CUSTOMER_REQUEST',
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "orderItemIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "reasonCategory" TEXT,
ADD COLUMN     "refundPercent" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "rejectReason" TEXT,
ADD COLUMN     "slaDueAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "userId" TEXT;

-- CreateTable
CREATE TABLE "RefundEvidence" (
    "id" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundAuditLog" (
    "id" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "consumer" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RefundEvidence_refundId_idx" ON "RefundEvidence"("refundId");

-- CreateIndex
CREATE INDEX "RefundAuditLog_refundId_idx" ON "RefundAuditLog"("refundId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedEvent_eventId_key" ON "ProcessedEvent"("eventId");

-- CreateIndex
CREATE INDEX "Refund_eventId_status_idx" ON "Refund"("eventId", "status");

-- AddForeignKey
ALTER TABLE "RefundEvidence" ADD CONSTRAINT "RefundEvidence_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundAuditLog" ADD CONSTRAINT "RefundAuditLog_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Backfill rows created before the refund workflow: they always refunded
-- the full amount paid, and the requester was the order's owner unless the
-- system auto-refunded it.
UPDATE "Refund" SET "grossAmount" = "amount" WHERE "grossAmount" IS NULL;
UPDATE "Refund" SET "userId" = "requestedBy" WHERE "userId" IS NULL AND "requestedBy" <> 'system';
UPDATE "Refund" SET "kind" = 'SYSTEM_ERROR' WHERE "requestedBy" = 'system';
