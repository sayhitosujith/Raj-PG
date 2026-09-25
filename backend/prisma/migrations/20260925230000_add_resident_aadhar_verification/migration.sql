-- CreateEnum
CREATE TYPE "AadharVerificationStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'REJECTED');

-- AlterTable
ALTER TABLE "Resident" ADD COLUMN     "aadharRejectionReason" TEXT,
ADD COLUMN     "aadharReviewedAt" TIMESTAMP(3),
ADD COLUMN     "aadharStatus" "AadharVerificationStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
ADD COLUMN     "aadharSubmittedAt" TIMESTAMP(3);


-- Existing residents start unverified; those with both a number and a card on file are ready
-- for the owner to review rather than having to resubmit.
UPDATE "Resident" SET "aadharStatus" = 'PENDING', "aadharSubmittedAt" = "createdAt"
WHERE coalesce("aadharNumber", '') <> '' AND coalesce("aadharCardUrl", '') <> '';
