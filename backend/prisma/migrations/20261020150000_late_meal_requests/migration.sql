-- CreateEnum
CREATE TYPE "LateMealStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- CreateTable
CREATE TABLE "LateMealRequest" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "meal" "MealType" NOT NULL,
    "status" "LateMealStatus" NOT NULL DEFAULT 'PENDING',
    "staffNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LateMealRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LateMealRequest_propertyId_date_idx" ON "LateMealRequest"("propertyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "LateMealRequest_residentId_date_meal_key" ON "LateMealRequest"("residentId", "date", "meal");

-- AddForeignKey
ALTER TABLE "LateMealRequest" ADD CONSTRAINT "LateMealRequest_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LateMealRequest" ADD CONSTRAINT "LateMealRequest_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

