-- Non-Indian residents are verified on passport and visa instead of Aadhaar. Every existing
-- resident is Indian, hence the default. Additive only; no existing data changes.
ALTER TABLE "Resident" ADD COLUMN "nationality" TEXT NOT NULL DEFAULT 'IN',
ADD COLUMN "passportNumber" TEXT,
ADD COLUMN "passportExpiry" DATE,
ADD COLUMN "passportScanUrl" TEXT,
ADD COLUMN "visaNumber" TEXT,
ADD COLUMN "visaType" TEXT,
ADD COLUMN "visaExpiry" DATE;
