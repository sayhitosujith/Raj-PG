-- When the owner last declined a resident's "Delete my account" request; shown to the resident
-- until they ask again.
ALTER TABLE "Resident" ADD COLUMN "deletionDeclinedAt" TIMESTAMP(3);
