-- CreateTable
CREATE TABLE "StaffSubscription" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffSubscription_staffId_endsOn_idx" ON "StaffSubscription"("staffId", "endsOn");

-- AddForeignKey
ALTER TABLE "StaffSubscription" ADD CONSTRAINT "StaffSubscription_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "SuperAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
