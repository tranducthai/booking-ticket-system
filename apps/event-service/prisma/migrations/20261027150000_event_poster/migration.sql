-- Separate portrait image for event cards (the wide cover stays in bannerUrl).
ALTER TABLE "Event" ADD COLUMN "posterUrl" TEXT;
