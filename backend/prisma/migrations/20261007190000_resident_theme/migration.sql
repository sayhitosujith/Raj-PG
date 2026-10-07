-- CreateEnum
CREATE TYPE "ResidentTheme" AS ENUM ('AUTO', 'LIGHT', 'DARK');

-- AlterTable
ALTER TABLE "WorkspaceSettings" ADD COLUMN "residentTheme" "ResidentTheme" NOT NULL DEFAULT 'AUTO';
