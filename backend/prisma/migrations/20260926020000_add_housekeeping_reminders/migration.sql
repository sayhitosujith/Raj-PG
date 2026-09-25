-- AlterTable
ALTER TABLE "HousekeepingRequest" ADD COLUMN     "lastReminderAt" TIMESTAMP(3),
ADD COLUMN     "reminderAcknowledgedAt" TIMESTAMP(3),
ADD COLUMN     "reminderCount" INTEGER NOT NULL DEFAULT 0;

