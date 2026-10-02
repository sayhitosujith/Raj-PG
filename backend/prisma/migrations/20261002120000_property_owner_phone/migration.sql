-- Owner's phone per property, for residents' "Call owner" button; optional, E.164.
ALTER TABLE "Property" ADD COLUMN "ownerPhone" TEXT;
