-- The WhatsApp receptionist bot's per-chat state (see WhatsAppChat in schema.prisma).
CREATE TABLE "WhatsAppChat" (
    "phone" TEXT NOT NULL,
    "step" TEXT,
    "repairCategory" TEXT,
    "stepAt" TIMESTAMP(3),
    "lastMessageId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppChat_pkey" PRIMARY KEY ("phone")
);
