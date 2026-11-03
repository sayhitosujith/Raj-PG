-- Self-registration links: staff send a link and the new resident fills in their own details.
ALTER TABLE "Resident" ADD COLUMN "registrationTokenHash" TEXT,
ADD COLUMN "registrationExpiresAt" TIMESTAMP(3),
ADD COLUMN "registrationSentAt" TIMESTAMP(3),
ADD COLUMN "registrationSubmittedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Resident_registrationTokenHash_key" ON "Resident"("registrationTokenHash");
