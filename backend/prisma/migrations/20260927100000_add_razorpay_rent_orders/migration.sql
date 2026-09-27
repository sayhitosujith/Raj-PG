-- CreateEnum
CREATE TYPE "RentOrderStatus" AS ENUM ('CREATED', 'PAID');

-- AlterTable
ALTER TABLE "RentPayment" ADD COLUMN     "razorpayPaymentId" TEXT;

-- CreateTable
CREATE TABLE "RentOrder" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "razorpayOrderId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "items" JSONB NOT NULL,
    "status" "RentOrderStatus" NOT NULL DEFAULT 'CREATED',
    "razorpayPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "RentOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RentOrder_razorpayOrderId_key" ON "RentOrder"("razorpayOrderId");

-- CreateIndex
CREATE INDEX "RentOrder_residentId_idx" ON "RentOrder"("residentId");

-- AddForeignKey
ALTER TABLE "RentOrder" ADD CONSTRAINT "RentOrder_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
