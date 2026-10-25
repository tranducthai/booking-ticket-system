-- Artist page: cover image, follows, posts.
ALTER TABLE "Artist" ADD COLUMN "coverUrl" TEXT;

CREATE TABLE "ArtistFollow" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArtistFollow_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ArtistFollow_artistId_userId_key" ON "ArtistFollow"("artistId", "userId");
CREATE INDEX "ArtistFollow_userId_idx" ON "ArtistFollow"("userId");
ALTER TABLE "ArtistFollow" ADD CONSTRAINT "ArtistFollow_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ArtistPost" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "imageUrl" TEXT,
    "membersOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArtistPost_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ArtistPost_artistId_createdAt_idx" ON "ArtistPost"("artistId", "createdAt");
ALTER TABLE "ArtistPost" ADD CONSTRAINT "ArtistPost_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
