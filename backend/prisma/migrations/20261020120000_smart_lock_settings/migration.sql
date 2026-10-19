-- AlterTable
ALTER TABLE "WorkspaceSettings" ADD COLUMN     "doorKeysEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "doorPinLength" INTEGER NOT NULL DEFAULT 6,
ADD COLUMN     "doorUnlockInstructions" TEXT,
ADD COLUMN     "lockLocation" TEXT,
ADD COLUMN     "lockModel" TEXT;

