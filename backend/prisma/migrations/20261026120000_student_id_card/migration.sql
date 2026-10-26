-- AlterTable
ALTER TABLE "Resident" ADD COLUMN     "studentIdCardUrl" TEXT;

-- Occupation becomes a choice (Student, Working professional, Business, or Other in the resident's own
-- words). Free text that plainly says "student" is mapped to the Student choice, so those residents are
-- asked for their student ID card the next time their details are saved; everything else stays as typed.
UPDATE "Resident" SET "occupation" = 'Student' WHERE LOWER(TRIM("occupation")) IN ('student', 'students');
