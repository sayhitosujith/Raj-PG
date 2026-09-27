-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "bankName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "method" TEXT NOT NULL DEFAULT 'cash',
ADD COLUMN     "payerName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "phone" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "qrExpiresAt" TIMESTAMP(3),
ADD COLUMN     "qrImageUrl" TEXT,
ADD COLUMN     "razorpayPaymentId" TEXT,
ADD COLUMN     "razorpayQrId" TEXT,
ADD COLUMN     "residentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_razorpayQrId_key" ON "Payment"("razorpayQrId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

