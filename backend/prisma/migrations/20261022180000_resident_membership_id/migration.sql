-- AlterTable
ALTER TABLE "Resident" ADD COLUMN     "memberNumber" SERIAL NOT NULL,
ADD COLUMN     "membershipId" TEXT;

-- SERIAL numbers existing rows in storage order; renumber them 1, 2, 3… in the order residents
-- joined, then move the sequence past them so new residents carry on from there.
UPDATE "Resident" r
SET "memberNumber" = numbered.num
FROM (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "joinedAt", "createdAt", "id") AS num
  FROM "Resident"
) numbered
WHERE r."id" = numbered."id";

SELECT setval(pg_get_serial_sequence('"Resident"', 'memberNumber'), COALESCE((SELECT MAX("memberNumber") FROM "Resident"), 0) + 1, false);

-- CreateIndex
CREATE UNIQUE INDEX "Resident_memberNumber_key" ON "Resident"("memberNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Resident_membershipId_key" ON "Resident"("membershipId");
