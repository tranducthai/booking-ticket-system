-- AlterTable
ALTER TABLE "SeatMap" ADD COLUMN     "gridCols" INTEGER,
ADD COLUMN     "gridRows" INTEGER,
ADD COLUMN     "stageLabel" TEXT;

-- AlterTable
ALTER TABLE "SeatZone" ADD COLUMN     "color" TEXT;

-- AlterTable
ALTER TABLE "Seat" ADD COLUMN     "gridCol" INTEGER,
ADD COLUMN     "gridRow" INTEGER;
