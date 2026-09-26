-- AlterTable
ALTER TABLE "WorkspaceSettings" ADD COLUMN     "housekeepingWeeklyLimit" INTEGER,
ADD COLUMN     "lateFee" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "noticePeriodDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "quietFrom" TEXT NOT NULL DEFAULT '22:00',
ADD COLUMN     "quietTo" TEXT NOT NULL DEFAULT '07:00',
ADD COLUMN     "securityDeposit" INTEGER,
ADD COLUMN     "visitingFrom" TEXT NOT NULL DEFAULT '10:00',
ADD COLUMN     "visitingTo" TEXT NOT NULL DEFAULT '20:00';
