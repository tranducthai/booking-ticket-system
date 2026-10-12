-- AlterEnum
ALTER TYPE "TicketStatus" ADD VALUE 'REFUND_PENDING';

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "qrVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "refundId" TEXT;

-- CreateIndex
CREATE INDEX "Ticket_refundId_idx" ON "Ticket"("refundId");

