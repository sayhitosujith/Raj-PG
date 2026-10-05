-- One optional emergency contact per resident (name, relationship, E.164 phone), editable by the
-- resident in "Edit my details" and by the owner in Edit resident.
ALTER TABLE "Resident" ADD COLUMN "emergencyContactName" TEXT;
ALTER TABLE "Resident" ADD COLUMN "emergencyContactRelation" TEXT;
ALTER TABLE "Resident" ADD COLUMN "emergencyContactPhone" TEXT;
