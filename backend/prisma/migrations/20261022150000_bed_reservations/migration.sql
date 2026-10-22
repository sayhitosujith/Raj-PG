-- CreateTable
CREATE TABLE "BedReservation" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "bedNumber" INTEGER NOT NULL,
    "note" TEXT,
    "reservedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BedReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BedReservation_roomId_bedNumber_key" ON "BedReservation"("roomId", "bedNumber");

-- AddForeignKey
ALTER TABLE "BedReservation" ADD CONSTRAINT "BedReservation_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

