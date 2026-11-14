-- The app is now called StayPilot: a brand-new workspace starts with that name until the owner sets their
-- own. Only the default changes; a workspace that already has a name keeps it.
ALTER TABLE "WorkspaceSettings" ALTER COLUMN "businessName" SET DEFAULT 'StayPilot';
