-- AlterTable
ALTER TABLE "WorkspaceSettings" ADD COLUMN "featureBadges" JSONB NOT NULL DEFAULT '{"faqs":"NEW","passkeys":"NEW","whatsapp":"BETA","email":"BETA"}';
