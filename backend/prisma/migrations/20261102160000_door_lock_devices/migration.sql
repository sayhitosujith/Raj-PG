-- Device type and configuration for each door lock; existing locks become PIN smart locks, as they were used.
ALTER TABLE "DoorLock" ADD COLUMN "deviceType" TEXT NOT NULL DEFAULT 'SMART_LOCK',
ADD COLUMN "brand" TEXT,
ADD COLUMN "model" TEXT,
ADD COLUMN "serialNumber" TEXT,
ADD COLUMN "unlockMethods" TEXT[] DEFAULT ARRAY['PIN']::TEXT[],
ADD COLUMN "installedAt" TEXT,
ADD COLUMN "notes" TEXT;
