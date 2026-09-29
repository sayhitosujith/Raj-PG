-- The WhatsApp message log becomes a log for every channel (WhatsApp and email). Renamed in place
-- rather than recreated, so the messages already sent (and their dedupe keys) are kept.
ALTER TABLE "WhatsAppMessage" RENAME TO "OutboundMessage";
ALTER TABLE "OutboundMessage" RENAME CONSTRAINT "WhatsAppMessage_pkey" TO "OutboundMessage_pkey";
ALTER TABLE "OutboundMessage" RENAME CONSTRAINT "WhatsAppMessage_residentId_fkey" TO "OutboundMessage_residentId_fkey";
ALTER INDEX "WhatsAppMessage_dedupeKey_key" RENAME TO "OutboundMessage_dedupeKey_key";
ALTER INDEX "WhatsAppMessage_createdAt_idx" RENAME TO "OutboundMessage_createdAt_idx";
ALTER TABLE "OutboundMessage" RENAME COLUMN "template" TO "kind";
ALTER TABLE "OutboundMessage" RENAME COLUMN "waMessageId" TO "providerMessageId";
ALTER TABLE "OutboundMessage" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'whatsapp';
CREATE INDEX "OutboundMessage_channel_createdAt_idx" ON "OutboundMessage"("channel", "createdAt");

-- Residents can turn email updates off, like WhatsApp; on by default.
ALTER TABLE "Resident" ADD COLUMN "emailOptIn" BOOLEAN NOT NULL DEFAULT true;
