-- The resident's vehicle (type and registration number), optional, for parking and security.
ALTER TABLE "Resident" ADD COLUMN "vehicleType" TEXT;
ALTER TABLE "Resident" ADD COLUMN "vehicleNumber" TEXT;
