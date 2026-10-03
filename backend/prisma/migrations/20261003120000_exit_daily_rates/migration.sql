-- Per-day rates for a resident's move-out month (days stayed from the 1st x rate, capped at the
-- month's rent), with and without food. Set in Settings -> Deposit and notice.
ALTER TABLE "WorkspaceSettings" ADD COLUMN "dailyRateWithFood" INTEGER NOT NULL DEFAULT 1250;
ALTER TABLE "WorkspaceSettings" ADD COLUMN "dailyRateWithoutFood" INTEGER NOT NULL DEFAULT 750;
