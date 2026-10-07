-- Referral rewards: each resident gets a referral code for their "Refer a friend" link, a booking
-- records which resident referred it, and a friend who joins and pays earns the referrer a rent
-- concession (a percentage off one month).
-- CreateEnum
CREATE TYPE "ConcessionStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- AlterTable
ALTER TABLE "Resident" ADD COLUMN     "referralCode" TEXT;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "referrerResidentId" TEXT;

-- CreateTable
CREATE TABLE "RentConcession" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "percent" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "referredResidentId" TEXT,
    "status" "ConcessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RentConcession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RentConcession_referredResidentId_key" ON "RentConcession"("referredResidentId");

-- CreateIndex
CREATE INDEX "RentConcession_residentId_idx" ON "RentConcession"("residentId");

-- CreateIndex
CREATE UNIQUE INDEX "Resident_referralCode_key" ON "Resident"("referralCode");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_referrerResidentId_fkey" FOREIGN KEY ("referrerResidentId") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentConcession" ADD CONSTRAINT "RentConcession_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentConcession" ADD CONSTRAINT "RentConcession_referredResidentId_fkey" FOREIGN KEY ("referredResidentId") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

