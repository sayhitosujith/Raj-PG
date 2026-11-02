-- Several smart locks per property, and door PINs for property staff as well as residents.
ALTER TABLE "DoorLockTask" RENAME COLUMN "residentName" TO "holderName";
ALTER TABLE "DoorLockTask" ADD COLUMN "lockId" TEXT,
ADD COLUMN "lockName" TEXT,
ADD COLUMN "holderKind" TEXT NOT NULL DEFAULT 'RESIDENT',
ADD COLUMN "workerId" TEXT;

ALTER TABLE "Worker" ADD COLUMN "doorAccessKey" TEXT;

-- CreateTable
CREATE TABLE "DoorLock" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "forResidents" BOOLEAN NOT NULL DEFAULT true,
    "forStaff" BOOLEAN NOT NULL DEFAULT false,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoorLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DoorLock_propertyId_idx" ON "DoorLock"("propertyId");
CREATE INDEX "DoorLockTask_workerId_idx" ON "DoorLockTask"("workerId");

-- AddForeignKey
ALTER TABLE "DoorLock" ADD CONSTRAINT "DoorLock_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DoorLockTask" ADD CONSTRAINT "DoorLockTask_lockId_fkey" FOREIGN KEY ("lockId") REFERENCES "DoorLock"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DoorLockTask" ADD CONSTRAINT "DoorLockTask_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;
