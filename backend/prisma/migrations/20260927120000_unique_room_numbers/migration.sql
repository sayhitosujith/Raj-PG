-- Remove duplicate room numbers within a property before making them unique. Only rooms with no
-- resident are removed: a free duplicate goes when its twin is occupied or older.
DELETE FROM "Room" r
WHERE NOT EXISTS (SELECT 1 FROM "Resident" x WHERE x."roomId" = r."id")
  AND EXISTS (
    SELECT 1 FROM "Room" o
    WHERE o."propertyId" = r."propertyId" AND o."number" = r."number" AND o."id" <> r."id"
      AND (EXISTS (SELECT 1 FROM "Resident" y WHERE y."roomId" = o."id") OR o."id" < r."id")
  );
-- CreateIndex
CREATE UNIQUE INDEX "Room_propertyId_number_key" ON "Room"("propertyId", "number");
