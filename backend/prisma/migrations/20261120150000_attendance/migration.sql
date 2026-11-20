-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'AWAY', 'ON_LEAVE');

-- CreateTable
CREATE TABLE "AttendanceMark" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "markedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceMark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceReport" (
    "residentId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceReport_pkey" PRIMARY KEY ("residentId","weekStart")
);

-- CreateIndex
CREATE INDEX "AttendanceMark_date_idx" ON "AttendanceMark"("date");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceMark_residentId_date_key" ON "AttendanceMark"("residentId", "date");

-- AddForeignKey
ALTER TABLE "AttendanceMark" ADD CONSTRAINT "AttendanceMark_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceReport" ADD CONSTRAINT "AttendanceReport_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

