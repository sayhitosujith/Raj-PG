-- The owner's reason for declining a "Delete my account" request, shown to the resident.
ALTER TABLE "Resident" ADD COLUMN "deletionDeclineReason" TEXT;
