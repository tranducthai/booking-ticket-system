-- CreateEnum
CREATE TYPE "TicketDeliveryMethod" AS ENUM ('E_TICKET', 'PRINT_AT_HOME');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "maxTicketsPerAccount" INTEGER;

-- AlterTable
ALTER TABLE "TicketType" ADD COLUMN     "deliveryMethod" "TicketDeliveryMethod" NOT NULL DEFAULT 'E_TICKET';
