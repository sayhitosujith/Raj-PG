-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "email" TEXT,
ADD COLUMN     "foodOpted" BOOLEAN,
ADD COLUMN     "message" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "moveInDate" TIMESTAMP(3),
ADD COLUMN     "phone" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "residentId" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'direct',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "roomNumber" SET DEFAULT '',
ALTER COLUMN "status" SET DEFAULT 'new';

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Existing requests used "pending" for what is now "new".
UPDATE "Booking" SET "status" = 'new' WHERE "status" = 'pending';
