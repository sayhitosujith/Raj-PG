-- A fire alarm raised for one property, by the owner or one of its residents. Active until an owner
-- clears it (clearedAt set); residents' portals poll for it and sound the alarm while it is active.
CREATE TABLE "FireAlert" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "raisedByName" TEXT NOT NULL,
    "raisedByResidentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clearedAt" TIMESTAMP(3),
    CONSTRAINT "FireAlert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FireAlert_propertyId_clearedAt_idx" ON "FireAlert"("propertyId", "clearedAt");

ALTER TABLE "FireAlert" ADD CONSTRAINT "FireAlert_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
