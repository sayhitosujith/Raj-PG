-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "reference" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "rentMonths" JSONB;

-- AlterTable
ALTER TABLE "WorkspaceSettings" ADD COLUMN     "upiId" TEXT,
ADD COLUMN     "upiPayeeName" TEXT;

