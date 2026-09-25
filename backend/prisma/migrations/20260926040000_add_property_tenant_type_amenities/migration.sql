-- CreateEnum
CREATE TYPE "TenantType" AS ENUM ('MEN', 'WOMEN', 'COLIVING');

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "tenantType" "TenantType";

