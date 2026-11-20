-- CreateTable
CREATE TABLE "ResidentCoverPhoto" (
    "residentId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResidentCoverPhoto_pkey" PRIMARY KEY ("residentId")
);

-- AddForeignKey
ALTER TABLE "ResidentCoverPhoto" ADD CONSTRAINT "ResidentCoverPhoto_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

