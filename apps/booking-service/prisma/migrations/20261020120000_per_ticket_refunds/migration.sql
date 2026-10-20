-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "refundedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "refundedAt" TIMESTAMP(3);
