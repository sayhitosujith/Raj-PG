-- AlterTable
ALTER TABLE "Resident" ADD COLUMN     "joinedAt" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP;


-- Backfill: until now the only move-in signal was when the record was created.
UPDATE "Resident" SET "joinedAt" = "createdAt"::date;
