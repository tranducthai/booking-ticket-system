-- Artists an organizer adds are requests the admins approve or reject.
CREATE TYPE "ArtistStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
ALTER TABLE "Artist" ADD COLUMN "status" "ArtistStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN "rejectedReason" TEXT;
CREATE INDEX "Artist_status_idx" ON "Artist"("status");
