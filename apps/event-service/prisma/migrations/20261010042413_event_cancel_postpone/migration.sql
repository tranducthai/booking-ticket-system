-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelRequestReason" TEXT,
ADD COLUMN     "cancelRequestedAt" TIMESTAMP(3),
ADD COLUMN     "canceledAt" TIMESTAMP(3),
ADD COLUMN     "postponedAt" TIMESTAMP(3),
ADD COLUMN     "refundWindowEndsAt" TIMESTAMP(3);

