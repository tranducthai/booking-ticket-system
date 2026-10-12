-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "minAge" INTEGER,
ADD COLUMN     "organizerDescription" TEXT,
ADD COLUMN     "organizerLogoUrl" TEXT,
ADD COLUMN     "organizerName" TEXT,
ADD COLUMN     "terms" TEXT;

-- AlterTable
ALTER TABLE "TicketType" ADD COLUMN     "description" TEXT,
ADD COLUMN     "isHidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxPerOrder" INTEGER,
ADD COLUMN     "minPerOrder" INTEGER NOT NULL DEFAULT 1;
