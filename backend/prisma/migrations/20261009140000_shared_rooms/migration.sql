-- Rooms can be shared: a room holds up to "beds" residents, so a resident's room is no longer unique.
DROP INDEX "Resident_roomId_key";
CREATE INDEX "Resident_roomId_idx" ON "Resident"("roomId");

ALTER TABLE "Room" ADD COLUMN "beds" INTEGER NOT NULL DEFAULT 1;

-- "Room"."occupied" is no longer read or written (occupancy is counted from the residents in a room).
-- It stays for now so an API still running the previous release keeps working during the deploy;
-- drop it in a later migration once this release is live.
