-- Super admins who are not Indian nationals record a passport number instead of Aadhaar.
ALTER TABLE "SuperAdmin" ADD COLUMN "passportNumber" TEXT;
