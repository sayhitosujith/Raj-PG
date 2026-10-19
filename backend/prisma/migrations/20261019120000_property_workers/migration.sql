-- CreateEnum
CREATE TYPE "WorkerRole" AS ENUM ('COOK', 'SECURITY', 'HOUSEKEEPING', 'ELECTRICIAN', 'PLUMBER');

-- CreateTable
CREATE TABLE "Worker" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "WorkerRole" NOT NULL,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Worker_propertyId_role_idx" ON "Worker"("propertyId", "role");

-- AddForeignKey
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry the existing housekeeping names over, keeping their order through createdAt.
INSERT INTO "Worker" ("id", "propertyId", "name", "role", "createdAt")
SELECT gen_random_uuid()::text, p."id", staff.name, 'HOUSEKEEPING', CURRENT_TIMESTAMP + (staff.position * INTERVAL '1 millisecond')
FROM "Property" p, unnest(p."housekeepingStaff") WITH ORDINALITY AS staff(name, position);

-- AlterTable
ALTER TABLE "Property" DROP COLUMN "housekeepingStaff";
