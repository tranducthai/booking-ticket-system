-- CreateTable
CREATE TABLE "EventFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventFavorite_userId_idx" ON "EventFavorite"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EventFavorite_userId_eventId_key" ON "EventFavorite"("userId", "eventId");

-- AddForeignKey
ALTER TABLE "EventFavorite" ADD CONSTRAINT "EventFavorite_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
