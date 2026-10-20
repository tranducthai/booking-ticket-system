-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "isOnline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "province" TEXT,
ADD COLUMN     "streetAddress" TEXT,
ADD COLUMN     "ward" TEXT;

-- CreateTable
CREATE TABLE "EventPrivateInfo" (
    "eventId" TEXT NOT NULL,
    "onlineUrl" TEXT,
    "payoutAccountHolder" TEXT,
    "payoutAccountNumber" TEXT,
    "payoutBankName" TEXT,
    "payoutBankBranch" TEXT,
    "invoiceBusinessType" TEXT,
    "invoiceName" TEXT,
    "invoiceAddress" TEXT,
    "invoiceTaxCode" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventPrivateInfo_pkey" PRIMARY KEY ("eventId")
);

-- AddForeignKey
ALTER TABLE "EventPrivateInfo" ADD CONSTRAINT "EventPrivateInfo_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
