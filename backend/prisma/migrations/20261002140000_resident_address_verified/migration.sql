-- False once a resident changes their own address, hiding its "Verified" badge until the owner
-- approves their ID again or edits the address themselves; existing addresses keep their state.
ALTER TABLE "Resident" ADD COLUMN "addressVerified" BOOLEAN NOT NULL DEFAULT true;
