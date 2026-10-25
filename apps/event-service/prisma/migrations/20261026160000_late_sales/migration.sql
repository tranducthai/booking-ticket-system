-- Organizer reopens unsold tickets after the sales deadline.
ALTER TABLE "Event" ADD COLUMN "lateSalesUntil" TIMESTAMP(3);
