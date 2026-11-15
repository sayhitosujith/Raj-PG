-- Dashboard > Reset: when the rent cards were last reset. Null (every existing workspace) counts all payments,
-- as before.
ALTER TABLE "WorkspaceSettings" ADD COLUMN "rentCountersResetAt" TIMESTAMP(3);
