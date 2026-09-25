-- CreateEnum
CREATE TYPE "HousekeepingSlot" AS ENUM ('MORNING', 'AFTERNOON', 'EVENING');

-- CreateEnum
CREATE TYPE "HousekeepingStatus" AS ENUM ('REQUESTED', 'SCHEDULED', 'DONE', 'CANCELLED');

-- CreateTable
CREATE TABLE "HousekeepingRequest" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "slot" "HousekeepingSlot" NOT NULL,
    "note" TEXT,
    "status" "HousekeepingStatus" NOT NULL DEFAULT 'REQUESTED',
    "ownerNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HousekeepingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HousekeepingRequest_status_date_idx" ON "HousekeepingRequest"("status", "date");

-- CreateIndex
CREATE INDEX "HousekeepingRequest_residentId_date_idx" ON "HousekeepingRequest"("residentId", "date");

-- AddForeignKey
ALTER TABLE "HousekeepingRequest" ADD CONSTRAINT "HousekeepingRequest_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

