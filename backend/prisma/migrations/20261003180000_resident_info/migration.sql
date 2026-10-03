-- The resident portal's Info tab. Per property: Wi-Fi, important contacts (one "Label: number" per
-- line) and check-in / check-out / gate-closing times ("HH:MM"). For the whole business: the owner's
-- own house rules (one per line) and FAQs (blocks separated by a blank line, question first).
ALTER TABLE "Property" ADD COLUMN "wifiName" TEXT;
ALTER TABLE "Property" ADD COLUMN "wifiPassword" TEXT;
ALTER TABLE "Property" ADD COLUMN "contacts" TEXT;
ALTER TABLE "Property" ADD COLUMN "checkInTime" TEXT;
ALTER TABLE "Property" ADD COLUMN "checkOutTime" TEXT;
ALTER TABLE "Property" ADD COLUMN "gateClosingTime" TEXT;
ALTER TABLE "WorkspaceSettings" ADD COLUMN "extraHouseRules" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WorkspaceSettings" ADD COLUMN "faqs" TEXT NOT NULL DEFAULT '';
