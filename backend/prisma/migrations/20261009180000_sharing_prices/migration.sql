-- CreateTable
CREATE TABLE "SharingPrice" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "beds" INTEGER NOT NULL,
    "rentWithFood" INTEGER NOT NULL,
    "rentWithoutFood" INTEGER NOT NULL,

    CONSTRAINT "SharingPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SharingPrice_propertyId_beds_key" ON "SharingPrice"("propertyId", "beds");

-- AddForeignKey
ALTER TABLE "SharingPrice" ADD CONSTRAINT "SharingPrice_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
