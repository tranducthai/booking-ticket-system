-- AlterTable
ALTER TABLE "TicketType" ADD COLUMN     "seatZoneId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "TicketType_seatZoneId_key" ON "TicketType"("seatZoneId");

-- AddForeignKey
ALTER TABLE "TicketType" ADD CONSTRAINT "TicketType_seatZoneId_fkey" FOREIGN KEY ("seatZoneId") REFERENCES "SeatZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every existing standing zone gets the tier that sells it, so maps
-- saved before this change become purchasable without being redrawn.
INSERT INTO "TicketType" ("id", "eventId", "name", "price", "quantityTotal", "description", "seatZoneId")
SELECT gen_random_uuid()::text, m."eventId", z."name", z."price", COALESCE(z."capacity", 0),
       'Khu đứng tự do — không có số ghế.', z."id"
FROM "SeatZone" z
JOIN "SeatMap" m ON m."id" = z."seatMapId"
WHERE z."isGeneral" = true
  AND NOT EXISTS (SELECT 1 FROM "TicketType" t WHERE t."seatZoneId" = z."id");
