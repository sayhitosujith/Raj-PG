-- CreateTable
CREATE TABLE "WorkspaceSettings" (
    "id" TEXT NOT NULL DEFAULT 'workspace',
    "businessName" TEXT NOT NULL DEFAULT 'Raj Properties',
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "rentDueDay" INTEGER NOT NULL DEFAULT 2,
    "rentReminderOneDay" INTEGER NOT NULL DEFAULT 1,
    "rentReminderTwoDay" INTEGER NOT NULL DEFAULT 2,
    "morningFrom" TEXT NOT NULL DEFAULT '08:00',
    "morningTo" TEXT NOT NULL DEFAULT '12:00',
    "afternoonFrom" TEXT NOT NULL DEFAULT '12:00',
    "afternoonTo" TEXT NOT NULL DEFAULT '16:00',
    "eveningFrom" TEXT NOT NULL DEFAULT '16:00',
    "eveningTo" TEXT NOT NULL DEFAULT '20:00',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceSettings_pkey" PRIMARY KEY ("id")
);

