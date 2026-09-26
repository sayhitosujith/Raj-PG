-- AlterTable
ALTER TABLE "Resident" ADD COLUMN     "policiesAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "policiesAcceptedVersion" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WorkspaceSettings" ADD COLUMN     "privacyPolicyUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "termsUpdatedAt" TIMESTAMP(3);
