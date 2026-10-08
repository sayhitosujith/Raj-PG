-- CreateTable
CREATE TABLE "StaffActivity" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffActivity_createdAt_idx" ON "StaffActivity"("createdAt");
