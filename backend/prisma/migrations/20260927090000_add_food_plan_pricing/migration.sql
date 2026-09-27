-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "rentWithFood" INTEGER,
ADD COLUMN     "rentWithoutFood" INTEGER;

-- AlterTable
ALTER TABLE "Resident" ADD COLUMN     "foodOpted" BOOLEAN NOT NULL DEFAULT true;
