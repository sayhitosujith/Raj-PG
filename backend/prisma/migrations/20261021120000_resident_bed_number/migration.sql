-- AlterTable
ALTER TABLE "Resident" ADD COLUMN     "bedNumber" INTEGER;

-- Give everyone already in a room a bed, numbered 1, 2, 3… in the order they joined, so the
-- Overview's room grid and the residents list show real beds from the start.
UPDATE "Resident" r
SET "bedNumber" = numbered.bed
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "roomId" ORDER BY "joinedAt", "createdAt", "id") AS bed
  FROM "Resident"
  WHERE "roomId" IS NOT NULL
) numbered
WHERE r."id" = numbered."id";

-- CreateIndex
CREATE UNIQUE INDEX "Resident_roomId_bedNumber_key" ON "Resident"("roomId", "bedNumber");
