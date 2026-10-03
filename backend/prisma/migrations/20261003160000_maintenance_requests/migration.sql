-- Resident complaints and repair requests: who raised it, what kind, details, an optional photo, the
-- owner's reply, and when it was last changed or resolved. Status runs open -> in_progress -> resolved.
ALTER TABLE "MaintenanceRequest" ADD COLUMN "residentId" TEXT;
ALTER TABLE "MaintenanceRequest" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'other';
ALTER TABLE "MaintenanceRequest" ADD COLUMN "details" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MaintenanceRequest" ADD COLUMN "photoUrl" TEXT;
ALTER TABLE "MaintenanceRequest" ADD COLUMN "ownerNote" TEXT;
ALTER TABLE "MaintenanceRequest" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "MaintenanceRequest" ADD COLUMN "resolvedAt" TIMESTAMP(3);

CREATE INDEX "MaintenanceRequest_residentId_idx" ON "MaintenanceRequest"("residentId");

ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;
