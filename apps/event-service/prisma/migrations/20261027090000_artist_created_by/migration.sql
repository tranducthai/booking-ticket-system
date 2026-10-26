-- Who created each artist, so an organizer can manage their own.
ALTER TABLE "Artist" ADD COLUMN "createdById" TEXT;
CREATE INDEX "Artist_createdById_idx" ON "Artist"("createdById");
