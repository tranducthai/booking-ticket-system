-- AlterTable
ALTER TABLE "TicketType" ADD COLUMN     "showtimeId" TEXT;

-- CreateTable
CREATE TABLE "Showtime" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Showtime_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Showtime_eventId_startTime_idx" ON "Showtime"("eventId", "startTime");

-- CreateIndex
CREATE INDEX "TicketType_showtimeId_idx" ON "TicketType"("showtimeId");

-- AddForeignKey
ALTER TABLE "Showtime" ADD CONSTRAINT "Showtime_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketType" ADD CONSTRAINT "TicketType_showtimeId_fkey" FOREIGN KEY ("showtimeId") REFERENCES "Showtime"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
