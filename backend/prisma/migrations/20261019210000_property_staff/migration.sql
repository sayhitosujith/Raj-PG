-- Leftovers of the reverted 20261019120000_property_workers migration, which created a Worker table
-- with other roles. Nothing reads it; dropped so this migration starts clean (no-op on a fresh database).
DROP TABLE IF EXISTS "Worker";
DROP TYPE IF EXISTS "WorkerRole";

-- CreateEnum
CREATE TYPE "WorkerRole" AS ENUM ('HEAD_COOK', 'HELPING_COOK', 'HOUSEKEEPING', 'SECURITY', 'ELECTRICIAN', 'PLUMBER');

-- CreateTable
CREATE TABLE "Worker" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "WorkerRole" NOT NULL,
    "phone" TEXT,
    "photoUrl" TEXT,
    "photoUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Worker_propertyId_role_idx" ON "Worker"("propertyId", "role");

-- AddForeignKey
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Carry the existing housekeeping names over, keeping their order through createdAt. The old column
-- stays (see schema.prisma) so the previous release keeps working until this one is live.
INSERT INTO "Worker" ("id", "propertyId", "name", "role", "createdAt")
SELECT gen_random_uuid()::text, p."id", staff.name, 'HOUSEKEEPING', CURRENT_TIMESTAMP + (staff.position * INTERVAL '1 millisecond')
FROM "Property" p, unnest(p."housekeepingStaff") WITH ORDINALITY AS staff(name, position);
