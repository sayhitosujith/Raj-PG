-- "Delete my account": the resident's pending request, and when the owner approved it (the record
-- stays for rent history, with personal details erased).
ALTER TABLE "Resident" ADD COLUMN "deletionRequestedAt" TIMESTAMP(3);
ALTER TABLE "Resident" ADD COLUMN "deletedAt" TIMESTAMP(3);
