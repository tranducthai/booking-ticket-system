-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "holdReleased" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paymentInProgress" BOOLEAN NOT NULL DEFAULT false;
