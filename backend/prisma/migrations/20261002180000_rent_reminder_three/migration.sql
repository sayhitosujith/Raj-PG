-- A third rent reminder day. Existing workspaces get it on their due day, so the cycle keeps its
-- dates; the Settings form asks for reminder 1 < 2 < 3 <= due day on the next save.
ALTER TABLE "WorkspaceSettings" ADD COLUMN "rentReminderThreeDay" INTEGER NOT NULL DEFAULT 3;
UPDATE "WorkspaceSettings" SET "rentReminderThreeDay" = "rentDueDay";
