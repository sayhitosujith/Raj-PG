-- AlterTable
ALTER TABLE "Resident" ADD COLUMN     "monthlyRent" INTEGER,
ADD COLUMN     "rentTrackedFrom" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RentPayment" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RentPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RentPayment_residentId_month_key" ON "RentPayment"("residentId", "month");

-- AddForeignKey
ALTER TABLE "RentPayment" ADD CONSTRAINT "RentPayment_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

