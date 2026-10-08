-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('SUPER_ADMIN', 'ADMIN');

-- AlterTable: everyone who already has a staff account stays a super admin.
ALTER TABLE "SuperAdmin" ADD COLUMN "staffRole" "StaffRole" NOT NULL DEFAULT 'SUPER_ADMIN',
ADD COLUMN "propertyIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
