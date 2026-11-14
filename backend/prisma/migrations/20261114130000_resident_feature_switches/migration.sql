-- Settings > Resident features: the features a super admin has switched off, as { "feature": false }.
-- Empty means everything stays on, as it is today.
ALTER TABLE "WorkspaceSettings" ADD COLUMN "residentFeatures" JSONB NOT NULL DEFAULT '{}';
