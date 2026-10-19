-- CreateEnum
CREATE TYPE "DoorLockAction" AS ENUM ('ADD', 'DELETE');

-- CreateTable
CREATE TABLE "DoorLockTask" (
    "id" TEXT NOT NULL,
    "action" "DoorLockAction" NOT NULL,
    "pin" TEXT NOT NULL,
    "residentId" TEXT,
    "residentName" TEXT NOT NULL,
    "propertyId" TEXT,
    "propertyName" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneAt" TIMESTAMP(3),
    "doneByName" TEXT,

    CONSTRAINT "DoorLockTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DoorLockTask_doneAt_createdAt_idx" ON "DoorLockTask"("doneAt", "createdAt");

-- CreateIndex
CREATE INDEX "DoorLockTask_residentId_action_pin_idx" ON "DoorLockTask"("residentId", "action", "pin");

-- AddForeignKey
ALTER TABLE "DoorLockTask" ADD CONSTRAINT "DoorLockTask_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoorLockTask" ADD CONSTRAINT "DoorLockTask_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

