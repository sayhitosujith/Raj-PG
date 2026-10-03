-- "Exit PG": a resident's notice to move out, which the owner approves or declines, then completes
-- on or after the date. One request at a time, so it lives on the resident.
CREATE TYPE "ExitStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

ALTER TABLE "Resident" ADD COLUMN "exitStatus" "ExitStatus";
ALTER TABLE "Resident" ADD COLUMN "exitDate" DATE;
ALTER TABLE "Resident" ADD COLUMN "exitReason" TEXT;
ALTER TABLE "Resident" ADD COLUMN "exitRequestedAt" TIMESTAMP(3);
ALTER TABLE "Resident" ADD COLUMN "movedOutAt" TIMESTAMP(3);
